const teacherPortal=document.querySelector('#teacher-portal');

if(teacherPortal){
  const emptyText='Für dieses Konto ist noch keine Klasse im Dozentenportal zugeordnet.';
  function enhance(){
    const empty=[...teacherPortal.querySelectorAll('.portal-empty')].find(node=>node.textContent?.trim()===emptyText);
    if(!empty||empty.dataset.assignmentGuidance==='1')return;
    empty.dataset.assignmentGuidance='1';
    empty.innerHTML=`
      <strong>Noch keine Dozentenportal-Zuordnung.</strong>
      <div class="meta" style="margin-top:7px;line-height:1.55">
        Ein vorhandener Dozenten-Stammdatensatz allein reicht nicht. Im Kunden-Admin müssen
        <strong>Dozent/in + Portal-Benutzerkonto + Klasse/Kurs</strong> ausdrücklich miteinander verknüpft werden.
      </div>
      <div class="meta" style="margin-top:7px;line-height:1.55">
        Wichtig: Ist dasselbe Benutzerkonto in dieser Klasse bereits Schüler oder Klassenadmin, wird die Dozentenzuordnung
        dort aus Datenschutzgründen absichtlich blockiert. Für dieselbe Person kann dafür ein separates Dozentenkonto verwendet werden.
      </div>
    `;
  }
  window.addEventListener('kp:teacher-state',enhance);
  enhance();
}
