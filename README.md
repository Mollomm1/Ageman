# HOW TO USE THIS SHIT


* read shit, and think.


## Required Setup

* A Desktop or Laptop


* Chrome (or anything based on it like Brave, Edge or Helium)


## HOWTO

* In Chrome (or Brave, Edge, Helium) install Tampermonkey and add this user script <a style="color: cyan;" download href="assets/k-id-bypasser.userscript.js">[k-id-bypasser.userscript.js]</a>.


* Be sure to enable "Allow userscripts", this is required on modern chrome versions <a style="color: cyan;" href="https://www.tampermonkey.net/faq.php#Q209">https://www.tampermonkey.net/faq.php#Q209</a>

* Open discord and execute the code bellow in the console.


<code>(async function(){try{let wp=webpackChunkdiscord_app.push([[Symbol()],{},(r)=>r]);webpackChunkdiscord_app.pop();let m=wp.m,c=wp.c;function findByCode(s){for(const[i,mod] of Object.entries(m)){if(mod.toString().includes(s))return c[i].exports}}function findObj(e,k){if(!e)return;for(const x in e){const o=e[x];if(o&&o[k])return o}}const api=findObj(findByCode('.set("X-Audit-Log-Reason",'),"patch");if(!api)return alert("API not found");const res=await api.post({url:"/age-verification/verify",body:{method:3}});if(res.body&&res.body.verification_webview_url){window.location.href=res.body.verification_webview_url}else{alert("Verification URL not found")}}catch(e){console.error(e)}})()</code>
this should redirect to the k-id verification page, from there select the Selfie Method.


* Press N to focus on the Character, Use your mouse+keyboard to do gestures, do N again if you need to unfocus.


* If everything was right you should be verified


## DEMO Video


<video width="420" controls><source src="assets/demov3.mp4" type="video/mp4"></video>


## Tips


* The userscript is unsupported on Firefox

* It make take a few tries before working, be patient.
