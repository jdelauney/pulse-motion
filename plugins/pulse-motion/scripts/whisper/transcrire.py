"""Pulse Motion - transcription d'une prise de voix (faster-whisper, licence MIT).

    python transcrire.py <prise.wav> --modele <dossier du modele> [--langue fr]

Derniere ligne de la sortie : les mots horodates en JSON [{"w", "t0", "t1"}] (ASCII echappe, lisible
quelle que soit la page de code). Progres sur la sortie d'erreur.
PM_WHISPER_FAUX=<fichier.json> : renvoie ce fichier sans transcrire (tests) ; PM_WHISPER_ATTENTE : secondes d'attente.
"""
import argparse
import json
import os
import sys
import time


def main():
    p = argparse.ArgumentParser()
    p.add_argument('wav')
    p.add_argument('--modele', required=True)
    p.add_argument('--langue', default='fr')
    a = p.parse_args()
    faux = os.environ.get('PM_WHISPER_FAUX')
    if faux:
        time.sleep(float(os.environ.get('PM_WHISPER_ATTENTE', '0')))
        with open(faux, encoding='utf-8') as f:
            print(json.dumps(json.load(f)))
        return 0
    from faster_whisper import WhisperModel
    modele = WhisperModel(a.modele, device='cpu', compute_type='int8')
    segments, _ = modele.transcribe(a.wav, language=a.langue, word_timestamps=True, beam_size=5)
    mots = []
    for s in segments:
        print('%.1f' % s.end, file=sys.stderr, flush=True)
        for m in (s.words or []):
            mots.append({'w': m.word, 't0': round(m.start, 3), 't1': round(m.end, 3)})
    print(json.dumps(mots))
    return 0


if __name__ == '__main__':
    sys.exit(main())
