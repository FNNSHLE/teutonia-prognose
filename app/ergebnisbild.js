// Ergebnis-Bild nach einem Spiel (1080 × 1350, Hochformat für WhatsApp und Instagram).
// Stil angelehnt an die Teutonia-Posts: Schwarz-Weiß, schmale Großbuchstaben, Rot als Akzent, „Schwarz Weiß Bunt“.
// Zeichnet auf ein Canvas; Logos und Fotos müssen vom eigenen Server kommen (daten/logos, daten/fotos),
// sonst sperrt der Browser das Canvas und das Bild lässt sich nicht speichern.
(function () {
  'use strict';
  const W = 1080;
  // Formate: Feed 4:5, Quadrat 1:1, Story 9:16. dy verschiebt den Kopf (Story: Platz für die Instagram-Leiste oben).
  const FORMATE = {
    feed: { h: 1350, dy: 0, titel: 176, titelY: 372, subY: 424, bandY: 470, spruchAbst: 168, spruchMax: 58, fuss: 120 },
    quadrat: { h: 1080, dy: -8, titel: 132, titelY: 292, subY: 336, bandY: 374, spruchAbst: 104, spruchMax: 46, fuss: 100 },
    story: { h: 1920, dy: 190, titel: 214, titelY: 740, subY: 804, bandY: 890, spruchAbst: 300, spruchMax: 64, fuss: 190 },
  };
  const F = { titel: 'AnwurfAnton', text: 'AnwurfInter', hand: 'AnwurfMarker' };
  const FARBE = { schwarz: '#0B0B0C', weiss: '#FFFFFF', papier: '#F6F5F2', grau: '#6E6E73', linie: '#D9D8D4', rot: '#E2231A' };
  const BUNT = ['#E2231A', '#F28C28', '#F5C21B', '#2DB35C', '#1E88E5', '#8E44AD'];

  let schriften = null;
  function ladeSchriften() {
    if (schriften) return schriften;
    const liste = [
      new FontFace(F.titel, "url('assets/fonts/anton.woff') format('woff')"),
      new FontFace(F.text, "url('assets/fonts/inter-600.woff') format('woff')", { weight: '600' }),
      new FontFace(F.hand, "url('assets/fonts/permanent-marker.woff') format('woff')"),
    ];
    schriften = Promise.all(liste.map(f => f.load().then(x => { document.fonts.add(x); return x; }).catch(() => null)));
    return schriften;
  }
  function ladeBild(src) {
    return new Promise(res => {
      if (!src) return res(null);
      const i = new Image();
      i.onload = () => res(i); i.onerror = () => res(null);
      i.src = src;
    });
  }

  // Text so lange verkleinern, bis er in die Breite passt
  function passend(ctx, text, familie, groesse, maxB, gewicht = '') {
    let g = groesse;
    do { ctx.font = `${gewicht} ${g}px ${familie}`.trim(); g -= 2; } while (ctx.measureText(text).width > maxB && g > 12);
    return g + 2;
  }
  function zeilenUmbruch(ctx, text, maxB) {
    const woerter = text.split(' '), zeilen = []; let z = '';
    woerter.forEach(w => { const t = z ? z + ' ' + w : w; if (ctx.measureText(t).width > maxB && z) { zeilen.push(z); z = w; } else z = t; });
    if (z) zeilen.push(z);
    return zeilen;
  }

  function wappen(ctx, img, mono, cx, cy, r) {
    ctx.save();
    ctx.fillStyle = FARBE.weiss;
    ctx.shadowColor = 'rgba(0,0,0,.14)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = FARBE.linie;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (img) {
      const s = r * 1.42, q = Math.min(s / img.width, s / img.height);
      const w = img.width * q, h = img.height * q;
      ctx.beginPath(); ctx.arc(cx, cy, r - 6, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    } else {
      ctx.fillStyle = FARBE.schwarz; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(r * 0.7)}px ${F.titel}`; ctx.fillText(mono || '?', cx, cy + 4);
    }
    ctx.restore();
  }

  function pinselStreifen(ctx, H) {
    // ruhige diagonale Struktur oben rechts und unten links, als Anklang an die Pinselspuren der Posts
    ctx.save();
    ctx.strokeStyle = 'rgba(11,11,12,.06)'; ctx.lineWidth = 2;
    for (let i = -6; i < 16; i++) { ctx.beginPath(); ctx.moveTo(760 + i * 26, 0); ctx.lineTo(1080 + i * 26, 320); ctx.stroke(); }
    for (let i = -6; i < 16; i++) { ctx.beginPath(); ctx.moveTo(-320 + i * 26, H - 320); ctx.lineTo(i * 26, H); ctx.stroke(); }
    ctx.restore();
  }

  async function zeichne(d, format = 'feed') {
    const L = FORMATE[format] || FORMATE.feed, H = L.h, dy = L.dy;
    await ladeSchriften();
    const [lHeim, lGast, lEigen, foto] = await Promise.all([ladeBild(d.heim.logo), ladeBild(d.gast.logo), ladeBild(d.eigenLogo), ladeBild(d.top && d.top.foto)]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Grund
    ctx.fillStyle = FARBE.papier; ctx.fillRect(0, 0, W, H);
    pinselStreifen(ctx, H);

    // Kopfzeile: eigenes Wappen, Mannschaft, Saison
    if (lEigen) { const s = 96, q = Math.min(s / lEigen.width, s / lEigen.height); ctx.drawImage(lEigen, 72, 56 + dy, lEigen.width * q, lEigen.height * q); }
    ctx.fillStyle = FARBE.schwarz; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `44px ${F.titel}`; ctx.fillText(d.mannschaft.toUpperCase(), lEigen ? 188 : 72, 122 + dy);
    ctx.textAlign = 'right'; ctx.font = `600 26px ${F.text}`; ctx.fillStyle = FARBE.grau;
    ctx.fillText(`SAISON ${d.saison}`, W - 72, 100 + dy);
    ctx.fillText(d.liga.toUpperCase(), W - 72, 136 + dy);

    // Titel
    ctx.textAlign = 'center'; ctx.fillStyle = FARBE.schwarz;
    ctx.font = `${L.titel}px ${F.titel}`; ctx.fillText('ENDSTAND', W / 2, L.titelY);
    ctx.font = `600 30px ${F.text}`; ctx.fillStyle = FARBE.grau;
    ctx.fillText(`Spieltag ${d.runde} · ${d.datumLang}`, W / 2, L.subY);

    // Ergebnis-Band
    const bandY = L.bandY, bandH = 372;
    ctx.fillStyle = FARBE.weiss;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.08)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    ctx.beginPath(); ctx.roundRect(56, bandY, W - 112, bandH, 28); ctx.fill(); ctx.restore();

    const xL = 248, xR = W - 248, yW = bandY + 150;
    wappen(ctx, lHeim, d.heim.mono, xL, yW, 96);
    wappen(ctx, lGast, d.gast.mono, xR, yW, 96);
    // Namen
    ctx.fillStyle = FARBE.schwarz; ctx.textAlign = 'center';
    [[d.heim, xL], [d.gast, xR]].forEach(([t, x]) => {
      passend(ctx, t.name.toUpperCase(), F.titel, 40, 300);
      ctx.fillText(t.name.toUpperCase(), x, yW + 160);
      ctx.font = `600 22px ${F.text}`; ctx.fillStyle = FARBE.grau;
      ctx.fillText(t === d.heim ? 'HEIM' : 'GAST', x, yW + 196);
      ctx.fillStyle = FARBE.schwarz;
    });
    // Spielstand: schwarzes Feld, die eigenen Tore in Rot
    const sW = 372, sH = 168, sX = W / 2 - sW / 2, sY = yW - 96;
    ctx.fillStyle = FARBE.schwarz; ctx.beginPath(); ctx.roundRect(sX, sY, sW, sH, 20); ctx.fill();
    ctx.font = `120px ${F.titel}`; ctx.textBaseline = 'middle';
    const th = String(d.toreHeim), tg = String(d.toreGast);
    ctx.fillStyle = d.eigenSeite === 'heim' ? '#FF4A3D' : FARBE.weiss; ctx.textAlign = 'right'; ctx.fillText(th, W / 2 - 30, sY + sH / 2 + 6);
    ctx.fillStyle = d.eigenSeite === 'gast' ? '#FF4A3D' : FARBE.weiss; ctx.textAlign = 'left'; ctx.fillText(tg, W / 2 + 30, sY + sH / 2 + 6);
    ctx.fillStyle = FARBE.weiss; ctx.textAlign = 'center'; ctx.fillText(':', W / 2, sY + sH / 2 - 2);
    ctx.textBaseline = 'alphabetic';
    if (d.halbzeit) { ctx.font = `600 24px ${F.text}`; ctx.fillStyle = FARBE.grau; ctx.fillText(`Halbzeit ${d.halbzeit}`, W / 2, sY + sH + 44); }
    // Ergebnis-Etikett, schräg wie das „VS“ der Posts
    if (d.etikett) {
      ctx.save(); ctx.translate(W / 2, sY - 18); ctx.font = `40px ${F.titel}`;
      const tw = ctx.measureText(d.etikett).width + 64;
      ctx.fillStyle = d.etikettFarbe || FARBE.rot;
      ctx.beginPath(); ctx.moveTo(-tw / 2 + 14, -30); ctx.lineTo(tw / 2 + 14, -30); ctx.lineTo(tw / 2 - 14, 30); ctx.lineTo(-tw / 2 - 14, 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = FARBE.weiss; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.etikett, 0, 3);
      ctx.restore(); ctx.textBaseline = 'alphabetic';
    }

    // Spruch
    let y = bandY + bandH + (d.top ? 124 : L.spruchAbst);
    ctx.save(); ctx.translate(W / 2, y); ctx.rotate(-0.035);
    ctx.fillStyle = FARBE.schwarz; ctx.textAlign = 'center';
    let g = L.spruchMax; ctx.font = `${g}px ${F.hand}`;
    let zeilen = zeilenUmbruch(ctx, d.spruch, 880);
    while (zeilen.length > 2 && g > 36) { g -= 4; ctx.font = `${g}px ${F.hand}`; zeilen = zeilenUmbruch(ctx, d.spruch, 880); }
    zeilen.forEach((z, i) => ctx.fillText(z, 0, i * (g + 10)));
    // roter Pinselstrich darunter
    const uy = (zeilen.length - 1) * (g + 10) + 24, uw = Math.min(520, ctx.measureText(zeilen[zeilen.length - 1]).width);
    ctx.strokeStyle = FARBE.rot; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-uw / 2, uy); ctx.quadraticCurveTo(0, uy + 10, uw / 2, uy - 4); ctx.stroke();
    ctx.restore();
    y += (zeilen.length - 1) * (g + 10);

    // Top-Werferin des eigenen Teams
    if (d.top) {
      const ty = y + 92, fx = W / 2 - 230;
      ctx.save(); ctx.beginPath(); ctx.arc(fx, ty, 44, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = '#E9E8E4'; ctx.fill();
      if (foto) { ctx.clip(); ctx.drawImage(foto, fx - 44, ty - 44, 88, 88); }
      else { ctx.fillStyle = FARBE.schwarz; ctx.font = `34px ${F.titel}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.top.ini, fx, ty + 2); }
      ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = `600 22px ${F.text}`; ctx.fillStyle = FARBE.grau; ctx.fillText('TOP-WERFERIN', fx + 66, ty - 12);
      ctx.font = `40px ${F.titel}`; ctx.fillStyle = FARBE.schwarz;
      ctx.fillText(`${d.top.name.toUpperCase()} · ${d.top.tore} TORE`, fx + 66, ty + 32);
    }

    // Fuß: Ort und Motto
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const fb = H - L.fuss + (L.fuss - 120) / 2; // Fußinhalt mittig im schwarzen Balken
    ctx.fillStyle = FARBE.schwarz; ctx.fillRect(0, H - L.fuss, W, L.fuss);
    ctx.font = `600 24px ${F.text}`; ctx.fillStyle = '#B9B9BE';
    if (d.ort) ctx.fillText(d.ort, W / 2, fb + 44);
    const motto = [['SCHWARZ ', FARBE.weiss], ['WEISS ', '#B9B9BE']];
    ctx.font = `34px ${F.titel}`;
    const bunt = 'BUNT', bB = ctx.measureText(bunt).width;
    const gesamt = motto.reduce((a, [t]) => a + ctx.measureText(t).width, 0) + bB;
    let x = W / 2 - gesamt / 2; ctx.textAlign = 'left';
    motto.forEach(([t, f]) => { ctx.fillStyle = f; ctx.fillText(t, x, fb + 90); x += ctx.measureText(t).width; });
    [...bunt].forEach((b, i) => { ctx.fillStyle = BUNT[i % BUNT.length]; ctx.fillText(b, x, fb + 90); x += ctx.measureText(b).width; });
    return c;
  }

  window.ergebnisBild = zeichne;
  window.ergebnisBildBlob = (d, format) => zeichne(d, format).then(c => new Promise(res => c.toBlob(res, 'image/png')));
})();
