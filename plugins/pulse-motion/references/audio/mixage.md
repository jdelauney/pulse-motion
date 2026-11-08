# Mixage

- Musique : fondu d'entrée de 0,5 s et de sortie de 1,5 s ; baissée de 10 dB pendant la voix (et creusée vers 2,5 kHz, là où se trouve la parole).
- Le mélange à plein volume est ramené à −16 LUFS (crête sous −1,5 dBFS, limiteur réglé à −2 dBFS) ; les volumes du déroulé (`voix.volume`, `musique.volume`, `bruitages.volume`) s'appliquent ensuite : « baisse la musique » = `musique.volume` plus bas.
- Pas d'élément `<audio>` dans une scène : tout le son passe par le déroulé et `data-son`.

