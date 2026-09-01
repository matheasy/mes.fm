(function(){
  var S=["aim-to-maintain-longterm-fitness","are-restaurants-really-healthier-than-fast-food","being-thin-does-not-mean-you-are-fit","belly-fat-linked-to-brain-shrinkage-and-dementia","bigger-baby-bottles-lead-to-weight-gain","breaking-through-the-dreaded-plateau","cardio-exercise-alleviates-depression","catching-up-on-sleep-myth","excercise-slows-the-aging-process","exercise-improves-brain-performance","have-a-merry-and-healthy-christmas","how-to-grow-your-muscles-and-get-results","intermittent-fasting-is-it-healthy","maintaining-weight-loss-is-hard","make-healthy-living-a-lifestyle","processed-carbs-can-increase-food-cravings","running-makes-you-high","simple-healthy-avocado-salad","sugary-drinks-dont-make-you-feel-full","the-8-glasses-of-water-myth","the-danger-of-sitting-down","the-importance-of-ab-workouts","what-low-fat-foods-are-hiding-from-you","you-cant-outexercise-a-bad-diet","your-body-is-the-best-bodyweight"],B="/bmicalculator/health-tips/";
  function wire(){
    var here=(location.pathname.split("/").pop()||"").replace(/\.html$/,"");
    [].forEach.call(document.querySelectorAll("a.btn-link"),function(a){
      if(!/Random/.test(a.textContent))return;
      a.setAttribute("href",B+S[Math.random()*S.length|0]);
      a.addEventListener("click",function(e){
        e.preventDefault();
        var p;do{p=S[Math.random()*S.length|0];}while(S.length>1&&p===here);
        location.href=B+p;
      });
    });
  }
  if(document.readyState!=="loading")wire();
  else document.addEventListener("DOMContentLoaded",wire);
})();
