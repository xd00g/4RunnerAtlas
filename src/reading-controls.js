const $=s=>document.querySelector(s);
const selectionHome=$('#selection').parentElement;
export function setSidebarVisible(visible){
  $('.workspace').classList.toggle('sidebar-hidden',!visible);
  $('#assembly-sidebar').hidden=!visible;
  $('#toggle-sidebar').setAttribute('aria-expanded',String(visible));
  $('#toggle-sidebar').textContent=visible?'Hide sidebar':'Show sidebar';
}
$('#toggle-sidebar').addEventListener('click',()=>setSidebarVisible($('#assembly-sidebar').hidden));
$('#expand-part').addEventListener('click',()=>{
  if($('#expand-part').disabled)return;
  $('#part-dialog-content').append($('#selection'));
  if(!$('#part-dialog').open)$('#part-dialog').showModal();
});
$('#close-part-dialog').addEventListener('click',()=>$('#part-dialog').close());
$('#part-dialog').addEventListener('close',()=>{selectionHome.append($('#selection'));$('#expand-part').focus();});
