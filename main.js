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
  const DEFAULTS=3;
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({h:render(readLines(src)),v:speedEl.value,z:size.value,n:DEFAULTS}))}catch(e){}
  }
  function refresh(){
    const lines=readLines(src);
    const chars=lines.reduce((n,l)=>n+l.reduce((m,r)=>m+r.t.replace(/\s/g,'').length,0),0);
    // 노란색(볼드)으로 쓴 한 덩어리가 펀치라인 하나다
    const punch=lines.reduce((n,l)=>n+l.filter(r=>r.b&&r.t.trim()).length,0);
    src.classList.toggle('empty',!chars);
    // 1,350자(5분)에 펀치라인 25개면 100점. 글자 수에 비례해 목표 개수를 잡는다
    const score=Math.min(100,Math.round(punch/(chars/1350*25)*100));
    $('stat').innerHTML=chars?`${chars.toLocaleString()}자 · <span class="y">펀치라인 ${punch}개 · ${score}점</span>`:'';
    speedV.textContent=speedEl.value;
    sizeV.textContent=size.value;
    // 글자 크기 바를 움직이면 입력 칸이 바로 같은 크기로 바뀐다
    src.style.fontSize=size.value+'px';
  }
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d){src.innerHTML=d.h||'';src.innerHTML=render(readLines(src));if(d.n>=2)size.value=d.z;if(d.n===DEFAULTS)speedEl.value=d.v;}
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
  speedEl.addEventListener('input',preview);

  // 기본 속도로 되돌리기
  $('speedReset').onclick=()=>{speedEl.value=5;refresh();save();preview();};
  // 메모 앱 기본 글자 크기로 되돌리기
  $('sizeReset').onclick=()=>{size.value=17;refresh();save();};
  // 옵션 영역은 끌어도 움직이지 않는다 (슬라이더만 예외)
  const opts=$('opts');
  opts.addEventListener('touchmove',e=>{if(e.target.type!=='range')e.preventDefault();},{passive:false});
  // 옵션을 누르면 키보드를 내린다
  opts.addEventListener('touchstart',()=>{if(document.activeElement===src)src.blur();},{passive:true});
  // 화면 높이 맞추기
  // 홈 화면 앱에서는 브라우저가 알려 주는 높이가 상태 표시줄만큼 모자라서 기기 화면 높이를 쓴다
  // 키보드가 올라오면 그만큼 빼서 대본 칸이 가려지지 않게 한다
  const vv=window.visualViewport;
  let baseH=0, baseW=0;
  function fit(){
    const h=vv?vv.height:window.innerHeight, w=window.innerWidth;
    if(w!==baseW){baseW=w;baseH=h;}
    baseH=Math.max(baseH,h);
    const landscape=w>h&&w>baseH;
    const full=navigator.standalone?(landscape?screen.width:screen.height):baseH;
    document.documentElement.style.setProperty('--vh',(full-(baseH-h))+'px');
    window.scrollTo(0,0);
    if(stage.classList.contains('on'))layout();
  }
  if(vv)vv.addEventListener('resize',fit);
  window.addEventListener('resize',fit);
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

  // 속도 1~10: 한 단계마다 약 1.36배씩 빨라져 1은 초당 약 0.7줄, 10은 약 11줄이다
  // 글자 크기에 비례해서 글자 크기를 바꿔도 줄이 지나가는 빠르기는 같다
  function pxPerSec(){
    return 0.9*Math.pow(16,(+speedEl.value-1)/9)*(+size.value);
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
    speedEl.value=+speedEl.value+d;
    refresh();save();
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
