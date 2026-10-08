const $=s=>document.querySelector(s);
const selectionHome=$('#selection').parentElement;
let partDialogOpener=null;
const isVisible=element=>element&&element.isConnected&&element.getClientRects().length>0&&!element.closest('[hidden]');
export function setSidebarVisible(visible){
  $('.workspace').classList.toggle('sidebar-hidden',!visible);
  $('#assembly-sidebar').hidden=!visible;
  $('#toggle-sidebar').setAttribute('aria-expanded',String(visible));
  $('#toggle-sidebar').textContent=visible?'Hide details':'Show details';
}
$('#toggle-sidebar').addEventListener('click',()=>setSidebarVisible($('#assembly-sidebar').hidden));
$('#expand-part').addEventListener('click',()=>{
  if($('#expand-part').disabled)return;
  partDialogOpener=document.activeElement;
  $('#part-dialog-content').append($('#selection'));
  if(!$('#part-dialog').open)$('#part-dialog').showModal();
});
$('#close-part-dialog').addEventListener('click',()=>$('#part-dialog').close());
$('#part-dialog').addEventListener('close',()=>{
  selectionHome.append($('#selection'));
  const focusTarget=[partDialogOpener,$('#expand-part'),$('#atlas-drawer-close'),$('#atlas-drawer-toggle'),$('#toggle-sidebar'),$('#viewport')].find(isVisible);
  focusTarget?.focus();
  partDialogOpener=null;
});
