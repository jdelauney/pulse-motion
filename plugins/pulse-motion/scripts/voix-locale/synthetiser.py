"""Pulse Motion - voix de synthese locale (Kokoro-82M, Apache-2.0, par kokoro-onnx, MIT).

    python synthetiser.py < entree.json

Entree (JSON sur l'entree standard, UTF-8) : {"phrases": [{"texte"}], "voix": "ff_siwis", "vitesse": 1,
"langue": "fr-fr", "dossier": <dossier de sortie>, "modele": <fichier .onnx>, "voix_fichier": <voices-v1.0.bin>}.
Sortie : un WAV mono 16 bits par phrase dans "dossier" ; derniere ligne de la sortie standard : {"phrases": [{"fichier",
"duree"}]} (ASCII echappe). Les silences entre phrases et les pauses sont poses par Pulse Motion (scripts/lib/voix-locale.js).
Kokoro lit le francais par espeak-ng (GPL-3.0), installe avec kokoro-onnx sur l'ordinateur de la personne et appele dans ce
processus separe : Pulse Motion ne le distribue pas.
PM_VOIX_LOCALE_FAUX=1 : sons temoins (un la doux, 0,06 s par lettre / vitesse), sans modele ni reseau (tests).
"""
import json
import math
import os
import struct
import sys
import wave


def ecrire_wav(chemin, echantillons, taux):
    with wave.open(chemin, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taux)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1.0, min(1.0, x)) * 32767)) for x in echantillons))


def faux(texte, vitesse, taux=24000):
    n = int(round(max(0.3, 0.06 * len(texte)) / vitesse * taux))
    return [0.5 * math.sin(2 * math.pi * 440 * i / taux) for i in range(n)], taux


def main():
    entree = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    phrases = entree.get('phrases') or []
    vitesse = float(entree.get('vitesse') or 1)
    dossier = entree['dossier']
    kokoro = None
    if not os.environ.get('PM_VOIX_LOCALE_FAUX'):
        from kokoro_onnx import Kokoro
        kokoro = Kokoro(entree['modele'], entree['voix_fichier'])
    sortie = []
    for k, p in enumerate(phrases):
        texte = str(p.get('texte') or '').strip()
        if kokoro is None:
            echantillons, taux = faux(texte, vitesse)
        else:
            son, taux = kokoro.create(texte, voice=entree.get('voix') or 'ff_siwis', speed=vitesse, lang=entree.get('langue') or 'fr-fr')
            echantillons = [float(x) for x in son]
        nom = 'phrase-%03d.wav' % k
        ecrire_wav(os.path.join(dossier, nom), echantillons, taux)
        sortie.append({'fichier': nom, 'duree': len(echantillons) / float(taux)})
        print('%d' % (k + 1), file=sys.stderr, flush=True)
    print(json.dumps({'phrases': sortie}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
