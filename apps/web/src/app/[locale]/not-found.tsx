/** Generic not-found presentation only. The existing notFound() callers
 * decide access and HTTP status; never inspect a route, session or resource here. */
export default function NotFound() {
  return (
    <main className="public-page entry-page">
      <section className="entry-not-found" data-generic-not-found>
        <p className="entry-not-found-code" aria-hidden="true">404</p>
        <div className="entry-not-found-de" lang="de" dir="ltr">
          <h1 aria-label="Seite nicht gefunden">{"Seite nicht ge\u00adfun\u00adden"}</h1>
          <p>Diese Seite ist nicht verfügbar.</p>
        </div>
        <div className="entry-not-found-ar" lang="ar" dir="rtl">
          <h1>الصفحة غير موجودة</h1>
          <p>هذه الصفحة غير متاحة.</p>
        </div>
      </section>
    </main>
  );
}
