// Von Hand gepflegt: Zu- und Absagen aus SpielerPlus je Spiel (Schlüssel: Spiel-ID von handball.net).
// dabei: Spielerinnen-IDs mit Zusage. Wer fehlt, gilt im Optimierer als nicht verfügbar.
// stand: Datum des Abgleichs; ein neuer Stand überschreibt, was auf einem Gerät von Hand umgeschaltet wurde.
// immerRaus: Spielerinnen, die grundsätzlich nicht spielen; sie gelten bei jedem Spiel als nicht verfügbar.
window.HB_ZUSAGEN = {
  immerRaus: ["0zq6bco"], // Phillis Dutschke
  // 08.11.2026 bei TV Fischbek II: 12 Zusagen, Absagen Irena und Carola (in SpielerPlus „Lola“), Phillis immer raus
  "675697": { stand: "2026-10-27", dabei: ["0cbebaf", "0iv7e52", "0r4agwv", "0xpr7jg", "0ikpy6y", "0n1j8do", "1bt1pug", "0liff2d", "13vxzhb", "0jotezw", "1r2lvr5", "1bjxdb2"] },
};
