function toggleSiteTheme(){var d=document.documentElement;var cur=d.getAttribute('data-theme')||"light";var next=cur==='dark'?'light':'dark';d.setAttribute('data-theme',next);try{localStorage.setItem("site-theme",next)}catch(e){}var btn=document.querySelector('[data-theme-toggle]');if(btn){var label=next==='light'?'Dark mode':'Light mode';btn.setAttribute('aria-label',label);btn.title=label;}}
(function(){
  var navBtn=document.querySelector("[data-nav-toggle]");
  var menuEl=document.getElementById("site-menu");
  if(navBtn&&menuEl){navBtn.addEventListener("click",function(){var open=menuEl.classList.toggle("is-open");navBtn.setAttribute("aria-expanded",open?"true":"false");navBtn.setAttribute("aria-label",open?"Close menu":"Open menu");});}
  var forms=document.querySelectorAll("[data-booking-form]");
  for(var i=0;i<forms.length;i++){(function(form){
    form.addEventListener("submit",function(ev){
      ev.preventDefault();
      var wa=form.getAttribute("data-whatsapp");
      var data={};
      for(var j=0;j<form.elements.length;j++){var f=form.elements[j];if(f.name)data[f.name]=f.value;}
      if(!data.phone){var msg=form.querySelector(".form__note");if(msg)msg.textContent="Please enter your phone number.";return;}
      if(wa){
        var text=encodeURIComponent("Booking request\nGuests: "+data.guests+"\nDate: "+data.date+"\nPhone: "+data.phone);
        window.open(wa+"?text="+text,"_blank");
      }else{
        var msg=form.querySelector(".form__note");if(msg)msg.textContent="Thank you! We will confirm your booking shortly.";
      }
    });
  })(forms[i]);}
})();