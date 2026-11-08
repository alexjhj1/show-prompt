// Show Prompt 음성 서버: 문장 하나를 Gemini TTS로 읽어 wav로 돌려준다
// 키는 이 서버 안에서만 쓰고 브라우저로 보내지 않는다
// 앞 모델의 사용량이 다 차면 다음 모델로 넘어간다 (무료 사용량은 모델마다 따로 센다)
const MODELS = (process.env.GEMINI_TTS_MODELS ||
  'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-lite-tts').split(',');
const DAILY_LIMIT = Number(process.env.TTS_DAILY_LIMIT || 400); // 하루에 만들 수 있는 문장 수
const MAX_CHARS = 300; // 한 번에 읽을 수 있는 글자 수

// 고를 수 있는 목소리 (앱 설정과 같은 목록)
const VOICES = ['Iapetus','Achernar'];

// 말투: 앱에서 고른 이름을 Gemini에게 주는 지시문으로 바꾼다
// 말투는 대본 앞에 [한글 지시]로 붙인다. 영어 지시문은 Gemini가 소리 내어 읽어 버리는 일이 있었다
const STYLES = {
  natural: '',
  standup: '스탠드업 코미디언처럼',
  calm: '차분하고 천천히',
  hype: '신나게',
  whisper: '속삭이듯',
  fast: '빠르게'
};

// 서버가 켜져 있는 동안만 세는 예비 카운터 (Upstash가 없을 때만 쓴다)
const memory = { day: '', count: 0 };

function today() {
  // 한국 날짜 기준으로 하루를 센다
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

// 오늘 사용량을 1 늘리고 늘어난 값을 돌려준다
async function countToday() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const key = 'show-prompt:tts:' + today();
  if (url && token) {
    const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 172800]])
    });
    const d = await r.json();
    return Number(d[0].result);
  }
  if (memory.day !== key) { memory.day = key; memory.count = 0; }
  return ++memory.count;
}

// Gemini가 소리 데이터만 줄 때 wav 머리말을 붙인다
function toWav(buf) {
  if (buf.slice(0, 4).toString() === 'RIFF') return buf;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}

function fail(res, code, msg) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: msg }));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return fail(res, 405, 'POST만 받아요');

  // 1. 키가 등록됐는지 확인
  if (!process.env.GEMINI_API_KEY) return fail(res, 500, '서버 설정이 아직 안 됐어요');

  // 2. 요청 내용 확인
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const text = body && typeof body.text === 'string' ? body.text.trim() : '';
  const voice = VOICES.includes(body && body.voice) ? body.voice : 'Iapetus';
  const style = (body && STYLES[body.style]) || '';
  if (!text) return fail(res, 400, '읽을 글이 없어요');
  if (text.length > MAX_CHARS) return fail(res, 413, '문장이 너무 길어요');

  // 3. 하루 사용량 제한
  let used;
  try { used = await countToday(); } catch (e) { return fail(res, 503, '사용량을 확인하지 못했어요'); }
  if (used > DAILY_LIMIT) return fail(res, 429, '오늘 음성 사용량을 다 썼어요');

  // 4. Gemini에게 음성 만들기 요청
  const prompt = style ? `[${style}] ${text}` : text;
  let part = null, quota = false;
  for (const model of MODELS) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
          }
        })
      });
    } catch (e) { return fail(res, 502, '음성 서버에 연결하지 못했어요'); }
    const d = await r.json().catch(() => ({}));
    if (r.status === 429) { quota = true; continue; }
    const c = d.candidates && d.candidates[0];
    part = c && c.content && c.content.parts && c.content.parts.find(p => p.inlineData);
    if (part) break;
    if (r.status === 404) continue; // 없어진 모델은 건너뛴다
    break;
  }
  // Gemini가 잠깐 막은 것은 503으로 알려서 앱이 기다렸다가 다시 받게 한다
  if (!part) return quota ? fail(res, 503, 'Gemini가 바빠요. 잠시 후 다시 받아요') : fail(res, 502, '음성을 만들지 못했어요');

  const wav = toWav(Buffer.from(part.inlineData.data, 'base64'));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('X-Used-Today', String(used));
  res.end(wav);
};
