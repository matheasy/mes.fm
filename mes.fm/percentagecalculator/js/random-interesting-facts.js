(function(){
  var S=["19-billion-servings-of-cocacola-products-consumed-daily","40-of-the-world-is-free","50-of-all-new-online-content-is-ai-generated-and-growing","access-to-clean-drinking-water","almost-1-billion-guns-in-the-world","doomsday-clock-90-seconds-until-global-catastrophe","dung-beetle-is-the-worlds-strongest-animal","economic-inequality","gender-imbalance-in-china","how-many-7-footers-are-in-the-world","modern-slavery-is-bigger-than-imagined","one-percent-of-people-are-ambidextrous","one-third-of-the-world-is-overweight-or-obese","percentage-of-college-graduates-in-debt","pokemon-go-made-nintendo-billions","pyramid-of-giza-took-20-years-to-build","seven-percent-of-all-people-born-are-living-now","study-political-beliefs-are-similar-to-religious-beliefs","teleportation-is-science-fact","the-black-death-killed-millions-of-people","the-entire-human-race-in-a-sugar-cube","the-human-body-is-mostly-water","the-human-brain-can-hold-a-ridiculous-amount-of-storage","the-iraq-war-death-toll","the-richest-american-in-history-john-d-rockefeller","there-are-over-12-billion-cars-in-the-world","there-are-over-a-billion-websites-worldwide","usa-prison-population","we-are-made-of-stars","we-feed-farm-animals-for-than-we-do-humans","world-monthly-active-facebook-users","you-can-recognize-people-of-your-own-race-easier","your-phone-is-more-powerful-than-moon-landing-computers"],B="/percentagecalculator/interesting-facts/";
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
