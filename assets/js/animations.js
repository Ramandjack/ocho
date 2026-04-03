const video = document.getElementById("heroVideo");
const btn = document.getElementById("soundToggle");

btn.addEventListener("click", () => {

if(video.muted){

video.muted = false;
btn.innerHTML = "🔊";

}else{

video.muted = true;
btn.innerHTML = "🔇";

}

});