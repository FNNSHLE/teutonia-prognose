// Social-Bilder: Endstand nach einem Spiel und Matchday-Ankündigung davor (Feed 4:5, Quadrat 1:1, Story 9:16).
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

  // Zwei Farbwelten: Endstand hell auf Papier, Matchday genau umgekehrt dunkel
  const THEMA = {
    hell: { grund: FARBE.papier, streifen: 'rgba(11,11,12,.06)', text: FARBE.schwarz, sub: FARBE.grau, band: FARBE.weiss, bandSchatten: 'rgba(0,0,0,.08)', ring: FARBE.linie,
      box: FARBE.schwarz, boxText: FARBE.weiss, fuss: FARBE.schwarz, fussText: '#B9B9BE', motto: [FARBE.weiss, '#B9B9BE'] },
    dunkel: { grund: '#0B0B0C', streifen: 'rgba(255,255,255,.07)', text: FARBE.weiss, sub: '#A1A1A6', band: '#1A1A1D', bandSchatten: 'rgba(0,0,0,.5)', ring: '#2C2C30',
      box: FARBE.weiss, boxText: FARBE.schwarz, fuss: FARBE.papier, fussText: '#55555A', motto: [FARBE.schwarz, '#8E8E93'] },
  };

  function wappen(ctx, img, mono, cx, cy, r, T) {
    ctx.save();
    ctx.fillStyle = FARBE.weiss;
    ctx.shadowColor = 'rgba(0,0,0,.14)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 3; ctx.strokeStyle = T.ring;
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

  function pinselStreifen(ctx, H, farbe) {
    // ruhige diagonale Struktur oben rechts und unten links, als Anklang an die Pinselspuren der Posts
    ctx.save();
    ctx.strokeStyle = farbe; ctx.lineWidth = 2;
    for (let i = -6; i < 16; i++) { ctx.beginPath(); ctx.moveTo(760 + i * 26, 0); ctx.lineTo(1080 + i * 26, 320); ctx.stroke(); }
    for (let i = -6; i < 16; i++) { ctx.beginPath(); ctx.moveTo(-320 + i * 26, H - 320); ctx.lineTo(i * 26, H); ctx.stroke(); }
    ctx.restore();
  }

  // Sponsor-Post: dunkel wie das Trikot, Foto als Hauptmotiv, Logo (falls vorhanden) oder Name auf weißer Karte
  const SPONSOR_LAYOUT = {
    feed: { z1: 176, z1g: 52, z2: 340, z2g: 150, fy: 420, fh: 560, fw: 780, spruch: 1112, spruchMax: 64 },
    quadrat: { z1: 134, z1g: 42, z2: 262, z2g: 116, fy: 312, fh: 430, fw: 640, spruch: 870, spruchMax: 52 },
    story: { z1: 380, z1g: 60, z2: 560, z2g: 166, fy: 660, fh: 800, fw: 860, spruch: 1640, spruchMax: 72 },
  };
  async function zeichneSponsor(d, format) {
    const L = FORMATE[format] || FORMATE.feed, S = SPONSOR_LAYOUT[format] || SPONSOR_LAYOUT.feed, H = L.h, T = THEMA.dunkel;
    await ladeSchriften();
    const [foto, logo] = await Promise.all([d.variante === 'logo' ? null : ladeBild(d.foto), ladeBild(d.logo)]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = T.grund; ctx.fillRect(0, 0, W, H);
    pinselStreifen(ctx, H, T.streifen);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // Überschrift: kleine Zeile, darunter groß
    ctx.fillStyle = T.sub; passend(ctx, d.zeile1.toUpperCase(), F.titel, S.z1g, 900); ctx.fillText(d.zeile1.toUpperCase(), W / 2, S.z1);
    ctx.fillStyle = T.text; passend(ctx, d.zeile2.toUpperCase(), F.titel, S.z2g, 940); ctx.fillText(d.zeile2.toUpperCase(), W / 2, S.z2);
    const fx = W / 2 - S.fw / 2;
    if (d.variante === 'logo') {
      // Logo groß auf ruhiger weißer Fläche
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
      ctx.fillStyle = FARBE.weiss; ctx.beginPath(); ctx.roundRect(fx, S.fy, S.fw, S.fh, 28); ctx.fill(); ctx.restore();
      if (logo) {
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        const q = Math.min((S.fw - 160) / logo.width, (S.fh - 160) / logo.height), w = logo.width * q, h = logo.height * q;
        ctx.drawImage(logo, W / 2 - w / 2, S.fy + S.fh / 2 - h / 2, w, h);
      } else { ctx.fillStyle = FARBE.schwarz; ctx.textBaseline = 'middle'; passend(ctx, d.name.toUpperCase(), F.titel, 140, S.fw - 160); ctx.fillText(d.name.toUpperCase(), W / 2, S.fy + S.fh / 2); ctx.textBaseline = 'alphabetic'; }
    } else {
      // Trikotfoto: leicht gedreht, weißer Rand
      ctx.save(); ctx.translate(W / 2, S.fy + S.fh / 2); ctx.rotate(-0.025); ctx.translate(-W / 2, -(S.fy + S.fh / 2));
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
      ctx.fillStyle = FARBE.weiss; ctx.beginPath(); ctx.roundRect(fx - 12, S.fy - 12, S.fw + 24, S.fh + 24, 22); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.save(); ctx.beginPath(); ctx.roundRect(fx, S.fy, S.fw, S.fh, 14); ctx.clip();
      if (foto) {
        const q = Math.max(S.fw / foto.width, S.fh / foto.height), w = foto.width * q, h = foto.height * q;
        const fyFokus = d.fokusY == null ? 0.5 : d.fokusY;
        ctx.drawImage(foto, fx + (S.fw - w) / 2, S.fy + Math.min(0, Math.max(S.fh - h, S.fh / 2 - h * fyFokus)), w, h);
      } else { ctx.fillStyle = '#2C2C30'; ctx.fillRect(fx, S.fy, S.fw, S.fh); }
      ctx.restore(); ctx.restore();
    }
    // kurzer Spruch
    ctx.save(); ctx.translate(W / 2, S.spruch); ctx.rotate(-0.035);
    ctx.fillStyle = T.text; ctx.textAlign = 'center'; ctx.font = `${S.spruchMax}px ${F.hand}`;
    passend(ctx, d.spruch, F.hand, S.spruchMax, 900);
    ctx.fillText(d.spruch, 0, 0);
    const uw = Math.min(520, ctx.measureText(d.spruch).width);
    ctx.strokeStyle = FARBE.rot; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-uw / 2, 26); ctx.quadraticCurveTo(0, 36, uw / 2, 22); ctx.stroke();
    ctx.restore();
    fussZeichnen(ctx, Object.assign({}, d, { ort: '' }), L, H, T);
    return c;
  }

  function fussZeichnen(ctx, d, L, H, T) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const fb = H - L.fuss + (L.fuss - 120) / 2;
    ctx.fillStyle = T.fuss; ctx.fillRect(0, H - L.fuss, W, L.fuss);
    ctx.font = `600 24px ${F.text}`; ctx.fillStyle = T.fussText;
    if (d.ort) ctx.fillText(d.ort, W / 2, fb + 44);
    const my = d.ort ? fb + 90 : H - L.fuss / 2 + 12;
    const motto = [['SCHWARZ ', T.motto[0]], ['WEISS ', T.motto[1]]];
    ctx.font = `34px ${F.titel}`;
    const bunt = 'BUNT', bB = ctx.measureText(bunt).width;
    const gesamt = motto.reduce((a, [t]) => a + ctx.measureText(t).width, 0) + bB;
    let x = W / 2 - gesamt / 2; ctx.textAlign = 'left';
    motto.forEach(([t, f]) => { ctx.fillStyle = f; ctx.fillText(t, x, my); x += ctx.measureText(t).width; });
    [...bunt].forEach((b, i) => { ctx.fillStyle = BUNT[i % BUNT.length]; ctx.fillText(b, x, my); x += ctx.measureText(b).width; });
  }

  // d.art: 'ergebnis' (Endstand) oder 'matchday' (Ankündigung)
  async function zeichne(d, format = 'feed') {
    if (d.art === 'sponsor') return zeichneSponsor(d, format);
    const L = FORMATE[format] || FORMATE.feed, H = L.h, dy = L.dy;
    const md = d.art === 'matchday', T = md ? THEMA.dunkel : THEMA.hell;
    await ladeSchriften();
    const [lHeim, lGast] = await Promise.all([ladeBild(d.heim.logo), ladeBild(d.gast.logo)]);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Grund
    ctx.fillStyle = T.grund; ctx.fillRect(0, 0, W, H);
    pinselStreifen(ctx, H, T.streifen);

    // Titel
    // Liga und Saison klein über dem Titel; oben bleibt frei
    ctx.textAlign = 'center'; ctx.fillStyle = T.sub; ctx.font = `600 24px ${F.text}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText(`${d.liga.replace(/\s*(Frauen|Damen|Männer|Herren)\b.*$/i, '').toUpperCase()} HAMBURG · SAISON ${d.saison}`, W / 2, L.titelY - Math.round(L.titel * 0.86) - 26);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = T.text;
    ctx.font = `${L.titel}px ${F.titel}`; ctx.fillText(md ? 'MATCHDAY' : 'ENDSTAND', W / 2, L.titelY);
    ctx.font = `600 30px ${F.text}`; ctx.fillStyle = T.sub;
    ctx.fillText(`Spieltag ${d.runde} · ${d.datumLang}`, W / 2, L.subY);

    // Band mit beiden Teams
    const bandY = L.bandY, bandH = 372;
    ctx.fillStyle = T.band;
    ctx.save(); ctx.shadowColor = T.bandSchatten; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
    ctx.beginPath(); ctx.roundRect(56, bandY, W - 112, bandH, 28); ctx.fill(); ctx.restore();

    const xL = 248, xR = W - 248, yW = bandY + 150;
    wappen(ctx, lHeim, d.heim.mono, xL, yW, 96, T);
    wappen(ctx, lGast, d.gast.mono, xR, yW, 96, T);
    ctx.textAlign = 'center';
    [[d.heim, xL, 'HEIM'], [d.gast, xR, 'GAST']].forEach(([t, x, rolle]) => {
      ctx.fillStyle = T.text; passend(ctx, t.name.toUpperCase(), F.titel, 40, 300);
      ctx.fillText(t.name.toUpperCase(), x, yW + 160);
      ctx.font = `600 22px ${F.text}`; ctx.fillStyle = T.sub; ctx.fillText(rolle, x, yW + 196);
    });

    // Mitte: Spielstand (Endstand) oder Anwurfzeit (Matchday)
    const sW = 372, sH = 168, sX = W / 2 - sW / 2, sY = yW - 96;
    ctx.fillStyle = T.box; ctx.beginPath(); ctx.roundRect(sX, sY, sW, sH, 20); ctx.fill();
    ctx.textBaseline = 'middle';
    if (md) {
      ctx.textAlign = 'center';
      ctx.fillStyle = T.boxText; ctx.font = `${d.zeit ? 112 : 92}px ${F.titel}`;
      ctx.fillText(d.zeit ? d.zeit : 'FOLGT', W / 2, sY + sH / 2 - 4);
      ctx.fillStyle = FARBE.grau; ctx.font = `600 22px ${F.text}`;
      ctx.fillText(d.zeit ? 'ANWURF' : 'TERMIN', W / 2, sY + sH - 20);
    } else {
      ctx.font = `120px ${F.titel}`;
      const th = String(d.toreHeim), tg = String(d.toreGast);
      ctx.fillStyle = d.eigenSeite === 'heim' ? '#FF4A3D' : T.boxText; ctx.textAlign = 'right'; ctx.fillText(th, W / 2 - 30, sY + sH / 2 + 6);
      ctx.fillStyle = d.eigenSeite === 'gast' ? '#FF4A3D' : T.boxText; ctx.textAlign = 'left'; ctx.fillText(tg, W / 2 + 30, sY + sH / 2 + 6);
      ctx.fillStyle = T.boxText; ctx.textAlign = 'center'; ctx.fillText(':', W / 2, sY + sH / 2 - 2);
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const unter = md ? d.halle : (d.halbzeit ? `Halbzeit ${d.halbzeit}` : '');
    if (unter) { ctx.fillStyle = T.sub; passend(ctx, unter, F.text, 24, 330, '600'); ctx.fillText(unter, W / 2, sY + sH + 44); }
    // Etikett, schräg wie das „VS“ der Posts
    if (d.etikett) {
      ctx.save(); ctx.translate(W / 2, sY - 18); ctx.font = `40px ${F.titel}`;
      const tw = ctx.measureText(d.etikett).width + 64;
      ctx.fillStyle = d.etikettFarbe || FARBE.rot;
      ctx.beginPath(); ctx.moveTo(-tw / 2 + 14, -30); ctx.lineTo(tw / 2 + 14, -30); ctx.lineTo(tw / 2 - 14, 30); ctx.lineTo(-tw / 2 - 14, 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = d.etikettText || FARBE.weiss; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.etikett, 0, 3);
      ctx.restore(); ctx.textBaseline = 'alphabetic';
    }

    // Spruch
    const y = bandY + bandH + L.spruchAbst;
    ctx.save(); ctx.translate(W / 2, y); ctx.rotate(-0.035);
    ctx.fillStyle = T.text; ctx.textAlign = 'center';
    let g = L.spruchMax; ctx.font = `${g}px ${F.hand}`;
    let zeilen = zeilenUmbruch(ctx, d.spruch, 880);
    while (zeilen.length > 2 && g > 36) { g -= 4; ctx.font = `${g}px ${F.hand}`; zeilen = zeilenUmbruch(ctx, d.spruch, 880); }
    zeilen.forEach((z, i) => ctx.fillText(z, 0, i * (g + 10)));
    const uy = (zeilen.length - 1) * (g + 10) + 24, uw = Math.min(520, ctx.measureText(zeilen[zeilen.length - 1]).width);
    ctx.strokeStyle = FARBE.rot; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-uw / 2, uy); ctx.quadraticCurveTo(0, uy + 10, uw / 2, uy - 4); ctx.stroke();
    ctx.restore();

    fussZeichnen(ctx, d, L, H, T);
    return c;
  }

  window.ergebnisBild = zeichne;
  window.ergebnisBildBlob = (d, format) => zeichne(d, format).then(c => new Promise(res => c.toBlob(res, 'image/png')));
})();
