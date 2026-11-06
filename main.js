// 스탠드업 프롬프터: 볼드체·괄호 색칠 + 속도 조절 자동 스크롤
(function(){
  const $ = id => document.getElementById(id);
  const src=$('src'), speedEl=$('speed'), speedV=$('speedV'), size=$('size'), sizeV=$('sizeV');
  const stage=$('stage'), scroller=$('scroller'), playBtn=$('playBtn'), toast=$('toast');
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ---- 입력 칸 내용 → 줄 목록 (각 줄은 글자 조각과 볼드 여부) ----
  const BLOCK=/^(DIV|P|LI|UL|OL|H[1-6]|TR|TABLE|BLOCKQUOTE|PRE|SECTION|ARTICLE)$/;
  const SKIP=/^(STYLE|SCRIPT|META|TITLE|HEAD|LINK)$/;
  function isBold(el){
    const cs=getComputedStyle(el), w=cs.fontWeight;
    return w==='bold'||parseInt(w,10)>=600||/bold/i.test(cs.fontFamily);
  }
  function readLines(root){
    const lines=[[]];
    const cur=()=>lines[lines.length-1];
    function add(text,bold){
      // 아이폰 메모의 특수 줄바꿈도 줄바꿈으로 본다
      text.replace(/\r\n?/g,'\n').split(/[\n\u2028\u2029]/).forEach((p,i)=>{
        if(i)lines.push([]);
        p=p.replace(/\u00a0/g,' ').replace(/[\ufffc\u200b\ufeff]/g,'');
        if(!p)return;
        const l=cur(), last=l[l.length-1];
        if(last&&last.b===bold)last.t+=p; else l.push({t:p,b:bold});
      });
    }
    function walk(node){
      node.childNodes.forEach(n=>{
        if(n.nodeType===3){
          // 태그 사이 들여쓰기 줄바꿈은 글자가 아니다
          if(/^\s*\n\s*$/.test(n.nodeValue)&&n.parentNode!==root&&[...n.parentNode.children].some(c=>BLOCK.test(c.tagName)))return;
          // 괄호 색칠용 칸은 굵기 판단에서 건너뛴다
          let el=n.parentNode;
          while(el!==root&&el.classList.contains('pause'))el=el.parentNode;
          add(n.nodeValue,el===root?false:isBold(el));
        }else if(n.nodeType===1&&!SKIP.test(n.tagName)){
          if(n.tagName==='BR'){lines.push([]);return;}
          const block=BLOCK.test(n.tagName);
          if(block&&cur().length)lines.push([]);
          walk(n);
          if(block&&cur().length)lines.push([]);
        }
      });
    }
    walk(root);
    while(lines.length&&!lines[lines.length-1].length)lines.pop();
    while(lines.length&&!lines[0].length)lines.shift();
    return lines;
  }
  // 입력 칸과 재생 화면이 같은 모양을 쓴다: 볼드체는 노랑, 괄호 글씨는 진한 회색
  // 붙여넣은 글자색·크기는 버리고 줄과 볼드만 남긴다
  function paint(t){return esc(t).replace(/(\([^)]*\)|（[^）]*）)/g,'<span class="pause">$1</span>');}
  function render(lines){
    return lines.map(l=>'<div class="ln">'+(l.length?l.map(r=>r.b?`<b>${paint(r.t)}</b>`:paint(r.t)).join(''):'<br>')+'</div>').join('');
  }

  // ---- 저장 (이 브라우저에만) ----
  const KEY='standup-prompter-v2', OLD='standup-prompter-v1';
  // 기본값을 바꾸면 이 번호를 올린다. 예전 기본값으로 저장된 속도·크기는 새 기본값으로 시작한다
  const DEFAULTS=2;
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({h:render(readLines(src)),v:speedEl.value,z:size.value,n:DEFAULTS}))}catch(e){}
  }
  function refresh(){
    const lines=readLines(src);
    const chars=lines.reduce((n,l)=>n+l.reduce((m,r)=>m+r.t.replace(/\s/g,'').length,0),0);
    let blocks=0;
    lines.forEach((l,i)=>{if(l.length&&(i===0||!lines[i-1].length))blocks++;});
    src.classList.toggle('empty',!chars);
    $('stat').textContent=chars?`코너 ${blocks}개 · ${chars}자`:'';
    speedV.textContent=speedEl.value;
    sizeV.textContent=size.value;
    // 글자 크기 바를 움직이면 입력 칸이 바로 같은 크기로 바뀐다
    src.style.fontSize=size.value+'px';
  }
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d){src.innerHTML=d.h||'';src.innerHTML=render(readLines(src));if(d.n===DEFAULTS){speedEl.value=d.v;size.value=d.z;}}
    else{
      // 이전 버전에 저장한 대본 가져오기
      const o=JSON.parse(localStorage.getItem(OLD)||'null');
      if(o){src.innerHTML=render((o.t||'').split('\n').map(t=>t?[{t,b:false}]:[]));}
    }
  }catch(e){}
  refresh();

  src.addEventListener('input',()=>{refresh();save();});
  [speedEl,size].forEach(el=>el.addEventListener('input',()=>{refresh();save();}));
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
  $('clearBtn').onclick=()=>{src.innerHTML='';refresh();save();src.focus();};

  // ---- 재생 ----
  let y=0, playing=false, last=0, raf=0, distance=0, toastTimer=0;

  // 속도 숫자는 대략 초당 글자 수라서 글자 크기를 바꿔도 읽는 빠르기가 비슷하다
  function pxPerSec(){
    const z=+size.value;
    return +speedEl.value*1.45*z*z/(window.innerWidth*0.88);
  }
  function layout(){
    const vh=window.innerHeight, top=Math.round(vh*0.33);
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
    playing=true;playBtn.textContent='⏸';last=performance.now();
    cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
  }
  function pause(){playing=false;playBtn.textContent='▶';cancelAnimationFrame(raf);}
  function toggle(){playing?pause():play();}
  function changeSpeed(d){
    speedEl.value=+speedEl.value+d;
    refresh();save();
    toast.textContent='속도 '+speedEl.value;toast.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),900);
  }

  $('startBtn').onclick=()=>{
    const lines=readLines(src);
    if(!lines.length){src.focus();return;}
    y=0;
    scroller.innerHTML=render(lines);
    stage.classList.add('on');document.body.style.overflow='hidden';
    layout();
    play();
  };
  $('backBtn').onclick=e=>{e.stopPropagation();pause();stage.classList.remove('on');document.body.style.overflow='';};
  $('slowBtn').onclick=e=>{e.stopPropagation();changeSpeed(-0.5);};
  $('fastBtn').onclick=e=>{e.stopPropagation();changeSpeed(0.5);};
  playBtn.onclick=e=>{e.stopPropagation();toggle();};
  $('hud').addEventListener('click',e=>e.stopPropagation());
  stage.addEventListener('click',toggle);

  // 손가락으로 위아래로 끌어 위치 조정
  let dragY=null,dragStart=0,moved=false;
  stage.addEventListener('touchstart',e=>{if(e.target.closest('#hud'))return;dragY=e.touches[0].clientY;dragStart=y;moved=false;},{passive:true});
  stage.addEventListener('touchmove',e=>{
    if(dragY===null)return;
    const dy=e.touches[0].clientY-dragY;
    if(Math.abs(dy)>8){moved=true;if(playing)pause();}
    if(moved){y=Math.min(distance,Math.max(0,dragStart-dy));apply();}
  },{passive:true});
  stage.addEventListener('touchend',e=>{if(moved)e.preventDefault();dragY=null;});

  document.addEventListener('keydown',e=>{
    if(!stage.classList.contains('on'))return;
    if(e.code==='Space'){e.preventDefault();toggle();}
    if(e.key==='ArrowUp')changeSpeed(0.5);
    if(e.key==='ArrowDown')changeSpeed(-0.5);
    if(e.key==='Escape')$('backBtn').click();
  });
  window.addEventListener('resize',()=>{if(stage.classList.contains('on'))layout();});
})();
