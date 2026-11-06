// 스탠드업 프롬프터: 잽·펀치 표시 + 속도 조절 자동 스크롤
(function(){
  const $ = id => document.getElementById(id);
  const src=$('src'), speedEl=$('speed'), speedV=$('speedV'), size=$('size'), sizeV=$('sizeV');
  const stage=$('stage'), scroller=$('scroller'), playBtn=$('playBtn'), toast=$('toast');
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ---- 입력 칸 내용 → 줄 목록 (각 줄은 글자 조각과 볼드·밑줄 여부) ----
  const BLOCK=/^(DIV|P|LI|UL|OL|H[1-6]|TR|TABLE|BLOCKQUOTE|PRE|SECTION|ARTICLE)$/;
  const SKIP=/^(STYLE|SCRIPT|META|TITLE|HEAD|LINK)$/;
  function isBold(el){
    const cs=getComputedStyle(el), w=cs.fontWeight;
    return w==='bold'||parseInt(w,10)>=600||/bold/i.test(cs.fontFamily);
  }
  function readLines(root){
    const lines=[[]];
    const cur=()=>lines[lines.length-1];
    function add(text,bold,under){
      // 아이폰 메모의 특수 줄바꿈도 줄바꿈으로 본다
      text.replace(/\r\n?/g,'\n').split(/[\n\u2028\u2029]/).forEach((p,i)=>{
        if(i)lines.push([]);
        p=p.replace(/\u00a0/g,' ').replace(/[\ufffc\u200b\ufeff]/g,'');
        if(!p)return;
        const l=cur(), last=l[l.length-1];
        if(last&&last.b===bold&&last.u===under)last.t+=p; else l.push({t:p,b:bold,u:under});
      });
    }
    function walk(node,under){
      node.childNodes.forEach(n=>{
        if(n.nodeType===3){
          // 태그 사이 들여쓰기 줄바꿈은 글자가 아니다
          if(/^\s*\n\s*$/.test(n.nodeValue)&&n.parentNode!==root&&[...n.parentNode.children].some(c=>BLOCK.test(c.tagName)))return;
          // 괄호 색칠용 칸은 굵기 판단에서 건너뛴다
          let el=n.parentNode;
          while(el!==root&&el.classList.contains('pause'))el=el.parentNode;
          add(n.nodeValue,el===root?false:isBold(el),under);
        }else if(n.nodeType===1&&!SKIP.test(n.tagName)){
          if(n.tagName==='BR'){lines.push([]);return;}
          const block=BLOCK.test(n.tagName);
          if(block&&cur().length)lines.push([]);
          // 밑줄은 자식에게 이어지지 않아서 위에서 내려 준다. 링크의 기본 밑줄은 빼고 본다
          walk(n,under||n.tagName==='U'||(n.tagName!=='A'&&/underline/.test(getComputedStyle(n).textDecorationLine)));
          if(block&&cur().length)lines.push([]);
        }
      });
    }
    walk(root,false);
    while(lines.length&&!lines[lines.length-1].length)lines.pop();
    while(lines.length&&!lines[0].length)lines.shift();
    return lines;
  }
  // 입력 칸과 재생 화면이 같은 모양을 쓴다
  // 볼드 = 잽(노랑), 밑줄 = 펀치(빨강), 둘 다 있으면 펀치, 괄호 글씨 = 진한 회색
  // 붙여넣은 글자색·크기는 버리고 줄과 볼드·밑줄만 남긴다
  function paint(t){return esc(t).replace(/(\([^)]*\)|（[^）]*）)/g,'<span class="pause">$1</span>');}
  function render(lines){
    return lines.map(l=>'<div class="ln">'+(l.length?l.map(r=>{
      const t=paint(r.t);
      return r.b&&r.u?`<b><u>${t}</u></b>`:r.b?`<b>${t}</b>`:r.u?`<u>${t}</u>`:t;
    }).join(''):'<br>')+'</div>').join('');
  }

  // ---- 저장 (이 브라우저에만) ----
  const KEY='standup-prompter-v2', OLD='standup-prompter-v1';
  // 기본값을 바꾸면 이 번호를 올린다. 예전 기본값으로 저장된 속도·크기는 새 기본값으로 시작한다
  const DEFAULTS=5;
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({h:render(readLines(src)),v:speedEl.value,z:size.value,n:DEFAULTS}))}catch(e){}
  }
  function refresh(){
    const lines=readLines(src);
    const lineText=lines.map(l=>l.map(r=>r.t).join(''));
    const hasText=lineText.some(t=>t.trim());
    // 괄호 안 글자(회색)는 말하지 않는 지시문이라 글자 수에서 뺀다
    const chars=lineText.reduce((n,t)=>n+t.replace(/\([^)]*\)|（[^）]*）/g,'').replace(/\s/g,'').length,0);
    // 표시된 한 덩어리를 하나로 센다
    const count=f=>lines.reduce((n,l)=>n+l.filter(r=>f(r)&&r.t.trim()).length,0);
    const jab=count(r=>r.b&&!r.u), punch=count(r=>r.u);
    src.classList.toggle('empty',!hasText);
    $('stat').innerHTML=hasText?`${chars.toLocaleString()}자 · <span class="y">잽 ${jab}</span> · <span class="r">펀치 ${punch}</span>`:'';
    speedV.textContent=speedEl.value;
    sizeV.textContent=size.value;
    // 글자 크기 바를 움직이면 입력 칸이 바로 같은 크기로 바뀐다
    src.style.fontSize=size.value+'px';
  }
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d){src.innerHTML=d.h||'';src.innerHTML=render(readLines(src));if(d.n>=2)size.value=Math.min(40,Math.max(12,+d.z));
      // 예전 단계로 저장된 속도는 같은 빠르기의 새 숫자로 바꾼다
      if(d.n===3||d.n===4){const v=d.n===3?d.v*2-1:+d.v;speedEl.value=Math.min(10,Math.round(5+(v-1)*5/9));}
      if(d.n===DEFAULTS)speedEl.value=d.v;}
    else{
      // 이전 버전에 저장한 대본 가져오기
      const o=JSON.parse(localStorage.getItem(OLD)||'null');
      if(o){src.innerHTML=render((o.t||'').split('\n').map(t=>t?[{t,b:false}]:[]));}
    }
  }catch(e){}
  refresh();

  src.addEventListener('input',()=>{refresh();save();});
  src.addEventListener('paste',()=>{
    // 브라우저가 서식째 붙여넣은 뒤에 읽어서 볼드체를 놓치지 않는다
    setTimeout(()=>{
      src.innerHTML=render(readLines(src));
      const r=document.createRange();r.selectNodeContents(src);r.collapse(false);
      const s=getSelection();s.removeAllRanges();s.addRange(r);
      refresh();save();
    },0);
  });
  // 직접 고친 내용도 입력을 마치면 괄호 색칠을 다시 입힌다
  src.addEventListener('blur',()=>{
    const h=render(readLines(src));
    if(src.innerHTML!==h)src.innerHTML=h;
  });
  // 속도 바를 움직이면 입력 칸이 그 속도로 잠깐 올라가서 빠르기를 미리 보여 준다
  let pv=0, pvEnd=0, pvLast=0, pvY=0;
  function previewTick(ts){
    if(ts>pvEnd){pv=0;return;}
    const dt=Math.min(0.1,Math.max(0,(ts-pvLast)/1000));pvLast=ts;
    const max=src.scrollHeight-src.clientHeight;
    if(max>0){
      pvY+=pxPerSec()*dt;
      if(pvY>=max)pvY=0;
      src.scrollTop=pvY;
    }
    pv=requestAnimationFrame(previewTick);
  }
  function preview(){
    pvEnd=performance.now()+3000;
    if(!pv){pvY=src.scrollTop;pvLast=performance.now();pv=requestAnimationFrame(previewTick);}
  }

  // 값을 한 칸 바꾸기
  function step(el,d,lo,hi){el.value=Math.min(hi,Math.max(lo,+el.value+d));refresh();save();}
  // 누르는 순간 바뀌고, 계속 누르고 있으면 연속으로 바뀐다
  function hold(btn,fn){
    let wait=0,rep=0;
    const stop=()=>{clearTimeout(wait);clearInterval(rep);};
    btn.addEventListener('pointerdown',e=>{
      e.preventDefault();fn();
      wait=setTimeout(()=>{rep=setInterval(fn,110);},400);
    });
    ['pointerup','pointercancel','pointerleave'].forEach(t=>btn.addEventListener(t,stop));
    btn.addEventListener('click',e=>{if(e.detail===0)fn();});
  }
  hold($('speedDown'),()=>{step(speedEl,-1,1,10);preview();});
  hold($('speedUp'),()=>{step(speedEl,1,1,10);preview();});
  hold($('sizeDown'),()=>step(size,-1,12,40));
  hold($('sizeUp'),()=>step(size,1,12,40));

  // 누름 손맛: 눌린 모습을 아주 짧은 터치에도 0.06초는 보여 준다
  let downEl=null,downAt=0;
  function liftKey(){
    const el=downEl;downEl=null;
    if(!el)return;
    const wait=60-(performance.now()-downAt);
    if(wait<=0)el.classList.remove('is-down');
    else setTimeout(()=>el.classList.remove('is-down'),wait);
  }
  document.addEventListener('pointerdown',e=>{
    const el=e.target.closest&&e.target.closest('.key');
    if(!el)return;
    liftKey();
    downEl=el;downAt=performance.now();
    el.classList.add('is-down');
  },true);
  ['pointerup','pointercancel','touchend','touchcancel'].forEach(t=>document.addEventListener(t,liftKey,true));

  // 기본 속도로 되돌리기
  $('speedReset').onclick=()=>{speedEl.value=9;refresh();save();preview();};
  // 메모 앱 기본 글자 크기로 되돌리기
  $('sizeReset').onclick=()=>{size.value=17;refresh();save();};
  // 옵션 영역은 끌어도 움직이지 않는다
  const opts=$('opts');
  opts.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  // 옵션을 누르면 키보드를 내린다
  opts.addEventListener('touchstart',()=>{if(document.activeElement===src)src.blur();},{passive:true});
  // 화면 높이 맞추기
  // 홈 화면 앱에서는 브라우저가 알려 주는 높이가 상태 표시줄만큼 모자라거나 때에 따라 달라져서 기기 화면 높이를 쓴다
  // 입력 중일 때만 키보드 높이를 빼서 대본 칸이 가려지지 않게 한다. 높이가 조금 줄어든 것을 키보드로 착각하면 아래에 빈 공간이 생긴다
  const vv=window.visualViewport;
  const isApp=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
  let baseH=0, baseW=0;
  function fit(){
    const h=vv?vv.height:window.innerHeight, w=window.innerWidth;
    const typing=document.activeElement===src;
    if(w!==baseW||!typing){baseW=w;baseH=h;}
    baseH=Math.max(baseH,h);
    const kb=typing&&baseH-h>120?baseH-h:0;
    const narrow=Math.min(screen.width,screen.height), long=Math.max(screen.width,screen.height);
    const full=isApp()?(w>narrow?narrow:long):baseH;
    document.documentElement.style.setProperty('--vh',(full-kb)+'px');
    window.scrollTo(0,0);
    if(stage.classList.contains('on'))layout();
  }
  if(vv)vv.addEventListener('resize',fit);
  window.addEventListener('resize',fit);
  // 다른 앱에서 돌아오거나 키보드를 닫을 때도 높이를 다시 맞춘다
  window.addEventListener('pageshow',fit);
  document.addEventListener('visibilitychange',fit);
  src.addEventListener('blur',fit);
  $('clearBtn').onclick=()=>{src.innerHTML='';refresh();save();src.focus();};

  // ---- 재생 ----
  // 재생·일시정지 아이콘
  const ICON={
    play:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause:'<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>'
  };
  function showIcon(name){playBtn.innerHTML=ICON[name];playBtn.dataset.icon=name;}
  showIcon('pause');
  let y=0, playing=false, last=0, raf=0, distance=0, toastTimer=0;

  // 속도 1~10: 한 단계마다 약 1.32배씩 빨라진다. 5가 예전 속도 1, 10이 예전 속도 10이다
  // 글자 크기에 비례해서 글자 크기를 바꿔도 줄이 지나가는 빠르기는 같다
  function pxPerSec(){
    return 0.9*Math.pow(4,(+speedEl.value-5)/5)*(+size.value);
  }
  function layout(){
    const vh=stage.clientHeight, top=Math.round(vh*0.33);
    scroller.style.fontSize=size.value+'px';
    scroller.style.paddingTop=top+'px';
    scroller.style.paddingBottom=(vh-top)+'px';
    distance=Math.max(1,scroller.scrollHeight-vh);
    y=Math.min(y,distance);
    apply();
  }
  function apply(){scroller.style.transform=`translateY(${-y}px)`;}
  function tick(ts){
    if(!playing)return;
    // 다른 앱에 다녀와도 대본이 튀지 않게 한 번에 움직이는 시간을 제한한다
    const dt=Math.min(0.1,Math.max(0,(ts-last)/1000));last=ts;
    y+=pxPerSec()*dt;
    if(y>=distance){y=distance;apply();pause();return;}
    apply();
    raf=requestAnimationFrame(tick);
  }
  function play(){
    if(y>=distance)y=0;
    playing=true;showIcon('pause');last=performance.now();
    cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
  }
  function pause(){playing=false;showIcon('play');cancelAnimationFrame(raf);}
  function toggle(){playing?pause():play();}
  function changeSpeed(d){
    step(speedEl,d,1,10);
    toast.textContent='속도 '+speedEl.value;toast.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),900);
  }

  $('startBtn').onclick=()=>{
    const lines=readLines(src);
    if(!lines.length){src.focus();return;}
    // 키보드를 내리고 미리보기를 멈춘다
    src.blur();pvEnd=0;
    y=0;
    scroller.innerHTML=render(lines);
    stage.classList.add('on');
    layout();
    play();
  };
  function close(){pause();stage.classList.remove('on');}
  const hud=$('hud');
  [['backBtn',close],['slowBtn',()=>changeSpeed(-1)],['playBtn',toggle],['fastBtn',()=>changeSpeed(1)]].forEach(([id,fn])=>{
    $(id).addEventListener('click',e=>{e.stopPropagation();fn();});
  });
  hud.addEventListener('click',e=>e.stopPropagation());
  // 아이폰에서는 손가락이 닿는 순간 바로 버튼이 눌리게 한다
  hud.addEventListener('touchstart',e=>{
    e.preventDefault();e.stopPropagation();
    const b=e.target.closest('button');
    if(b)b.click();
  },{passive:false});

  // 재생 화면은 탭해도 멈추지 않고, 끌면 재생을 유지한 채 위치만 옮긴다. 정지는 아래 버튼으로 한다
  let lastY=null;
  stage.addEventListener('touchstart',e=>{lastY=e.touches[0].clientY;},{passive:true});
  stage.addEventListener('touchmove',e=>{
    if(lastY===null)return;
    const cy=e.touches[0].clientY;
    y=Math.min(distance,Math.max(0,y-(cy-lastY)));apply();
    lastY=cy;
  },{passive:true});
  stage.addEventListener('touchend',()=>{lastY=null;});

  document.addEventListener('keydown',e=>{
    if(!stage.classList.contains('on'))return;
    if(e.code==='Space'){e.preventDefault();toggle();}
    if(e.key==='ArrowUp')changeSpeed(1);
    if(e.key==='ArrowDown')changeSpeed(-1);
    if(e.key==='Escape')close();
  });
  fit();
})();
