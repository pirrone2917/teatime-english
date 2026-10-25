// Rappel quotidien à ajouter dans l'agenda du téléphone (fichier .ics) : gratuit, sans notification à gérer.
const APP = 'https://pirrone2917.github.io/teatime-english/';
const VTZ = ['BEGIN:VTIMEZONE', 'TZID:Europe/Brussels',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'];
export function icsRoute(url) {
  const m = (url.searchParams.get('t') || '19:00').match(/^(\d{1,2}):(\d{2})$/);
  const hh = Math.min(23, +(m ? m[1] : 19)), mm = Math.min(59, +(m ? m[2] : 0));
  const p2 = (n) => String(n).padStart(2, '0');
  const d = new Date(Date.now() + 864e5); // à partir de demain
  const day = d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate());
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tea Time English//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...VTZ,
    'BEGIN:VEVENT', `UID:tea-time-rappel-${p2(hh)}${p2(mm)}@teatime-english`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Brussels:${day}T${p2(hh)}${p2(mm)}00`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    'SUMMARY:☕ Tea Time English : ton trajet du jour', `DESCRIPTION:8 minutes d'anglais avec Miss Kokkinis : ${APP}`, `URL:${APP}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:Tea Time English', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'];
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="tea-time-rappel.ics"', 'Cache-Control': 'no-store' } });
}
