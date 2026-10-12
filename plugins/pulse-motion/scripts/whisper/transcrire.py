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
import wave


def lire_wav(chemin):
    """WAV PCM 16 bits (les prises de Pulse Motion) -> son mono a 16 kHz, sans passer par PyAV."""
    import numpy as np
    with wave.open(chemin, 'rb') as w:
        canaux, taux, largeur = w.getnchannels(), w.getframerate(), w.getsampwidth()
        brut = w.readframes(w.getnframes())
    if largeur != 2:
        raise ValueError('WAV 16 bits attendu')
    x = np.frombuffer(brut, dtype='<i2').astype(np.float32) / 32768.0
    if canaux > 1:
        x = x.reshape(-1, canaux).mean(axis=1)
    if taux != 16000:
        t = np.arange(0, len(x) / taux, 1 / 16000.0)
        x = np.interp(t, np.arange(len(x)) / taux, x).astype(np.float32)
    return x


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
    segments, _ = modele.transcribe(lire_wav(a.wav), language=a.langue, word_timestamps=True, beam_size=5)
    mots = []
    for s in segments:
        print('%.1f' % s.end, file=sys.stderr, flush=True)
        for m in (s.words or []):
            mots.append({'w': m.word, 't0': round(m.start, 3), 't1': round(m.end, 3)})
    print(json.dumps(mots))
    return 0


if __name__ == '__main__':
    sys.exit(main())
