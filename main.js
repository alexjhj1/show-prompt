// 스탠드업 프롬프터: 대본 색칠 + 시간 맞춤 자동 스크롤
(function(){
  const $ = id => document.getElementById(id);
  const src=$('src'), min=$('min'), sec=$('sec'), size=$('size'), sizeV=$('sizeV'),
        auto=$('auto'), mirror=$('mirror'), countdown=$('countdown');
  const stage=$('stage'), scroller=$('scroller'), guide=$('guide'), bar=$('bar'),
        hud=$('hud'), timeEl=$('time'), playBtn=$('playBtn'), countEl=$('count');

  // ---- 저장 (이 브라우저에만) ----
  const KEY='standup-prompter-v1';
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({t:src.value,m:min.value,s:sec.value,z:size.value,
      a:auto.checked,r:mirror.checked,c:countdown.checked}))}catch(e){}
  }
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d){src.value=d.t||'';min.value=d.m??5;sec.value=d.s??0;size.value=d.z||38;
      auto.checked=d.a!==false;mirror.checked=!!d.r;countdown.checked=d.c!==false;}
  }catch(e){}
  sizeV.textContent=size.value;

  function updateStat(){
    const t=src.value.trim();
    const chars=t.replace(/\s/g,'').length;
    const blocks=t?t.split(/\n\s*\n/).filter(b=>b.trim()).length:0;
    $('stat').textContent=t?`코너 ${blocks}개 · ${chars}자`:'';
  }
  updateStat();
  [src,min,sec,size,auto,mirror,countdown].forEach(el=>el.addEventListener('input',()=>{
    sizeV.textContent=size.value;updateStat();save();
  }));
  $('clearBtn').onclick=()=>{src.value='';updateStat();save();src.focus();};

  // ---- 대본 → 색칠된 HTML ----
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  function inline(s){
    let h=esc(s);
    h=h.replace(/!!(.+?)!!/g,'<span class="p">$1</span>');
    h=h.replace(/(\([^)]*\)|（[^）]*）)/g,'<span class="pause">$1</span>');
    return h;
  }
  function render(){
    const blocks=src.value.replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.split('\n').map(l=>l.trim()).filter(Boolean)).filter(b=>b.length);
    let html='';
    blocks.forEach(lines=>{
      html+='<div class="blk">';
      lines.forEach((l,i)=>{
        let cls='ln';
        let text=l;
        const isTitle=/^##/.test(l);
        const hasPunch=/!!.+?!!/.test(l);
        const onlyPause=/^(\([^)]*\)|（[^）]*）)$/.test(l);
        if(isTitle){cls+=' title';text=l.replace(/^##\s*/,'');}
        else if(/^!!.+!!$/.test(l)){cls+=' punch';text=l.slice(2,-2);}
        else if(!hasPunch && !onlyPause && auto.checked && lines.length>1){
          // 자동 색칠: 기호 없는 줄만
          const realLines=lines.filter(x=>!/^(\([^)]*\)|（[^）]*）)$/.test(x));
          const first=realLines[0], last=realLines[realLines.length-1];
          const titleFirst=/^##/.test(lines[0]);
          if(l===last && realLines.length>1) cls+=' punch';
          else if(l===first && !titleFirst) cls+=' in';
          else if(titleFirst && l===realLines[1] && realLines.length>2) cls+=' in';
        }
        html+=`<p class="${cls}">${inline(text)}</p>`;
      });
      html+='</div>';
    });
    return html;
  }

  // ---- 재생 ----
  let duration=300, elapsed=0, rate=1, playing=false, last=0, raf=0, distance=0, guideY=0, hudTimer=0;

  function layout(){
    const vh=window.innerHeight;
    guideY=Math.round(vh*0.33);
    guide.style.top=guideY+'px';
    scroller.style.fontSize=size.value+'px';
    scroller.style.paddingTop=guideY+'px';
    scroller.style.paddingBottom=(vh-guideY)+'px';
    distance=Math.max(1,scroller.scrollHeight-vh);
    apply();
  }
  function apply(){
    const p=Math.min(1,elapsed/duration);
    const y=-p*distance;
    scroller.style.transform=`translateY(${y}px)`+(mirror.checked?' scaleX(-1)':'');
    bar.style.width=(p*100)+'%';
    const f=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
    timeEl.textContent=`${f(elapsed)} / ${f(duration)}`+(rate!==1?` ×${rate.toFixed(1)}`:'');
  }
  function tick(ts){
    if(!playing)return;
    const dt=(ts-last)/1000;last=ts;
    elapsed+=dt*rate;
    if(elapsed>=duration){elapsed=duration;apply();pause();showHud(true);return;}
    apply();
    raf=requestAnimationFrame(tick);
  }
  function play(){
    if(elapsed>=duration)elapsed=0;
    playing=true;playBtn.textContent='⏸';last=performance.now();
    cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
    showHud(false);
  }
  function pause(){playing=false;playBtn.textContent='▶';cancelAnimationFrame(raf);showHud(true);}
  function toggle(){playing?pause():play();}
  function showHud(stay){
    hud.classList.remove('hide');clearTimeout(hudTimer);
    if(!stay)hudTimer=setTimeout(()=>{if(playing)hud.classList.add('hide')},2500);
  }

  function runCountdown(done){
    if(!countdown.checked){done();return;}
    let n=3;countEl.style.display='flex';countEl.textContent=n;
    const iv=setInterval(()=>{
      n--; if(n<=0){clearInterval(iv);countEl.style.display='none';done();}
      else countEl.textContent=n;
    },1000);
  }

  $('startBtn').onclick=()=>{
    if(!src.value.trim()){src.focus();return;}
    duration=Math.max(5,(parseInt(min.value)||0)*60+(parseInt(sec.value)||0));
    elapsed=0;rate=1;
    scroller.innerHTML=render();
    stage.classList.add('on');document.body.style.overflow='hidden';
    layout();
    pause();
    runCountdown(play);
  };
  $('backBtn').onclick=e=>{e.stopPropagation();pause();stage.classList.remove('on');document.body.style.overflow='';};
  $('restartBtn').onclick=e=>{e.stopPropagation();pause();elapsed=0;apply();runCountdown(play);};
  $('slowBtn').onclick=e=>{e.stopPropagation();rate=Math.max(0.5,+(rate-0.1).toFixed(1));apply();showHud(!playing);};
  $('fastBtn').onclick=e=>{e.stopPropagation();rate=Math.min(2,+(rate+0.1).toFixed(1));apply();showHud(!playing);};
  playBtn.onclick=e=>{e.stopPropagation();toggle();};
  hud.addEventListener('click',e=>e.stopPropagation());
  stage.addEventListener('click',()=>{ if(countEl.style.display==='flex')return; toggle(); });

  // 손가락으로 위치 조정 (일시정지 상태에서 위아래로 끌기)
  let dragY=null,dragE=0,moved=false;
  stage.addEventListener('touchstart',e=>{if(e.target.closest('#hud'))return;dragY=e.touches[0].clientY;dragE=elapsed;moved=false;},{passive:true});
  stage.addEventListener('touchmove',e=>{
    if(dragY===null)return;
    const dy=e.touches[0].clientY-dragY;
    if(Math.abs(dy)>8){moved=true; if(playing)pause();}
    if(moved){elapsed=Math.min(duration,Math.max(0,dragE-dy/distance*duration));apply();}
  },{passive:true});
  stage.addEventListener('touchend',e=>{ if(moved){e.preventDefault();} dragY=null; });

  document.addEventListener('keydown',e=>{
    if(!stage.classList.contains('on'))return;
    if(e.code==='Space'){e.preventDefault();toggle();}
    if(e.key==='ArrowUp'){rate=Math.min(2,+(rate+0.1).toFixed(1));apply();}
    if(e.key==='ArrowDown'){rate=Math.max(0.5,+(rate-0.1).toFixed(1));apply();}
    if(e.key==='Escape'){$('backBtn').click();}
  });
  window.addEventListener('resize',()=>{if(stage.classList.contains('on'))layout();});
})();
