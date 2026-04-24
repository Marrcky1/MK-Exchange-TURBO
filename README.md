# Triburile.ro - MK Exchange TURBO

**MK Exchange TURBO** este un userscript Tampermonkey pentru Triburile.ro, conceput pentru automatizarea procesului de monitorizare și cumpărare din Premium Exchange.

Scriptul urmărește constant stocul disponibil pentru resursele selectate, execută refresh automat la intervale configurabile și încearcă să cumpere rapid cantitatea maximă disponibilă atunci când sunt îndeplinite condițiile setate.

## Funcționalități

- Monitorizare automată a stocului din Premium Exchange
- Refresh automat la interval randomizat
- Cumpărare rapidă pentru resursele active
- Suport pentru lemn, argilă și fier
- Selectare individuală a resurselor urmărite
- Setare pentru stoc minim necesar
- Panou vizual integrat în pagină
- Log în timp real pentru acțiunile scriptului
- Statistici pentru cumpărări și refresh-uri
- Notificări vizuale după cumpărare
- Shortcut `CTRL + M` pentru afișarea panoului
- Detectare CAPTCHA și oprire automată

## Interfață

Scriptul adaugă un panou de control cu temă dark/terminal, de unde pot fi ajustate:

- resursele active;
- intervalul minim și maxim de refresh;
- stocul minim pentru cumpărare;
- rularea manuală a ciclului;
- oprirea scriptului;
- vizualizarea logurilor și statisticilor.

- <img width="342" height="549" alt="image" src="https://github.com/user-attachments/assets/ccf88147-acd9-4d6b-bd94-a920235b9c6e" />


## Configurare

Valorile principale pot fi modificate direct din cod sau din panoul scriptului:

```js
let RESURSE_ACTIVE = { wood: true, stone: true, iron: true };

let REFRESH_MIN = 2;
let REFRESH_MAX = 3;
let MIN_STOC = 100;
