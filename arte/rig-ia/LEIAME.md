# Ninja montado com as peças geradas por IA

- `src/`: as folhas que a IA gerou (frente, esquerda, direita, costas de cada peça).
- `pecas.py` + `extrair.py`: recortam cada vista, repixelizam no tamanho do jogo e refazem o contorno.
- `rig.py`: monta o boneco (quadro 80 x 88, corpo no meio) e gira braços e pernas nos pivôs.
- `anim.py`: as animações (parado, andar, correr com os braços para trás, soco, espada) → `saida/`.
  Cada folha tem 4 linhas (baixo, esquerda, direita, cima) e um quadro por coluna; `animacoes.json` diz quantos quadros e quantos ms cada um.
- Regerar: `python3 anim.py` (precisa de Pillow e numpy).
- Faltam: tronco (pele), bandana e cachecol (prompts novos na conversa).
