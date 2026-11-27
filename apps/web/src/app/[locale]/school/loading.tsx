/** Static, locale-aware navigation fallback; the authenticated shell remains mounted. */
export default function LoadingSchoolRoute() {
  return <section className="school-route-loading" data-async-state="loading" aria-busy="true">
    <p role="status" className="screen-reader-only">
      <span className="route-loading-ar" lang="ar">جارٍ التحميل</span>
      <span className="route-loading-de" lang="de">Wird geladen</span>
    </p>
    <div className="skeleton skeleton-list" aria-hidden="true">
      {Array.from({length:3},(_,i)=><div className="skeleton-row" key={i}><span/><span/></div>)}
    </div>
  </section>;
}
