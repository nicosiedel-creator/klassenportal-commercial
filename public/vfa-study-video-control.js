(() => {
  function stopInactiveVideos(){
    document.querySelectorAll('.slide:not(.active) iframe').forEach(frame=>{
      if(frame.dataset.lastStoppedSrc===frame.src)return;
      frame.dataset.lastStoppedSrc=frame.src;
      frame.src=frame.src;
    });
    document.querySelectorAll('.slide.active iframe').forEach(frame=>{delete frame.dataset.lastStoppedSrc;});
  }
  addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.slide iframe').forEach(frame=>frame.setAttribute('loading','lazy'));
    const deck=document.getElementById('deck');if(!deck)return;
    new MutationObserver(stopInactiveVideos).observe(deck,{subtree:true,attributes:true,attributeFilter:['class']});
  },{once:true});
})();
