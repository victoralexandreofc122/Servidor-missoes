# Tutorial: design (v64)

* **Base:** o capítulo 6 do "Manual Definitivo de Design Narrativo" (tutoriais opcionais e referências contextuais, o
  método em 3 etapas da Unity, comunicação diegética) e a matriz de erros comuns (tutorial intrusivo e expositivo).
* **O que já existia e continua:** a interface guiada da Academia (os botões aparecem conforme a etapa), as 4 salas com
  porta trancada pelo servidor e o Pergaminho do Mestre (capítulos que abrem por nível, com prêmio de ryō e XP).

---

## 1. O método em 3 etapas, sala por sala

```
[ 1. Apresentação isolada ] ---> [ 2. Prática em espaço seguro ] ---> [ 3. Portão de maestria ]
   (o professor mostra)              (sem risco, erre à vontade)          (a porta só abre provando)
```

| Sala | 1. Apresentação (fala do professor) | 2. Prática segura (por que não há risco) | 3. Portão (o que o servidor confere) |
|---|---|---|---|
| Taijutsu (Aya) | "Golpe curto, de perto: 🗡️ Ataque Básico" | Os bonecos não revidam; os jutsus ficam guardados (só o básico) | 3 bonecos destruídos com o Ataque Básico |
| Controle (Daichi) | "Esta sala bebe chakra... 🧘 Meditar" | O campo só drena chakra: nada fere; o chakra começa baixo de propósito | A barra cheia meditando contra o dreno |
| Jutsus (Kenji) | "Olha onde vai pousar! 💨 Teleporte" e o tronco da 🪵 Substituição | O vão não machuca (o Teleporte nunca para dentro dele); a armadilha existe para ser anulada pela Substituição, quantas vezes for preciso | Saltar o vão com o Teleporte e anular a armadilha com a Substituição |
| Armas (Mei) | "Kunai de Treino na mochila. Equipe." | O boneco não revida | Um golpe com a kunai equipada |
| **Fora da Academia** | O Pergaminho do Mestre (capítulo por nível) | A orla da Floresta (lodos verdes, fracos, perto do portão) e a dica `DCA_FLORESTA` | A Missão de Genin (nível 11) e o Rito do Despertar |

As falas estão em `src/realtime/falas.ts` (`TUT_*`); o cartão da etapa na tela (`TUTORIAL_STEPS`, `public/game.js`)
repete as 3 partes em uma frase: o que fazer, por que ali é seguro, o que abre a porta.

## 2. Dicas na hora (pistas contextuais)

O guia: "fornecer pistas contextuais na tela que surgem apenas no momento exato da ação". As 13 dicas
(`public/lore.js`, `HINTS`; o módulo é `public/dicas.js`):

| Dica | Quando aparece |
|---|---|
| `DCA_FLORESTA` | Primeira vez na Floresta (depois da Academia) |
| `DCA_VIDA_BAIXA` | Vida abaixo de 35% fora da zona segura |
| `DCA_SEM_CHAKRA` | Um jutsu recusado por falta de chakra |
| `DCA_PONTOS` | Subiu de nível com pontos de atributo para gastar |
| `DCA_MORTE` | Primeira queda (fora da arena) |
| `DCA_PERGAMINHO` | Primeiro pergaminho na mochila |
| `DCA_JUTSU_NOVO` | Primeira Extração com sucesso |
| `DCA_SELOS` | Primeiros selos interrompidos |
| `DCA_ZONA` | Primeira vez na Zona de Conflito |
| `DCA_ARENA` | Primeira vez na Arena das Quatro Heranças |
| `DCA_VIAGEM` | Primeira vez no Posto de Viagem |
| `DCA_FRAGMENTO` | Primeiro fragmento da Crônica guardado |
| `DCA_RELIQUIA` | Primeira relíquia |

**Regras (contra a "mão dada"):**
- Cada dica aparece **uma vez por aparelho** (guardada no navegador).
- É um cartão pequeno embaixo, que **não para o jogo**: some sozinho em cerca de 10 s.
- **Desligar dicas** no próprio cartão; religar no **Manual** ("💡 Dicas na hora"). Religar mostra as dicas de novo.
- Esperam a hora certa: nada aparece durante o tutorial da Academia, no Criador ou com o Manual aberto.

## 3. Referência rápida (tutorial opcional)

- **Folha de controles** no **Manual → 🎮 Folha de controles**: cada ação com a tecla do computador e o gesto do celular
  (`CONTROLS`, `public/lore.js`). Sempre aberta, sem capítulo nem nível.
- O **Pergaminho do Mestre** continua opcional: "Fechar (já entendi)" a qualquer momento; o prêmio é só por ler.

## 4. Comunicação diegética (o cenário ensina)

| Regra do mundo | Como o espaço comunica |
|---|---|
| Onde há algo a descobrir | O brilho dourado dos fragmentos (luz como ponto focal) |
| Mapa ainda trancado | A névoa na saída (v62): não passa, e o Posto de Viagem nem oferece o destino |
| A Sala de Controle drena chakra | O campo cobre a sala inteira; o chakra começa baixo |
| Zona segura | O ícone 🕊️ e a regra de nunca punir ali (consistência: o jogador confia) |

## 5. O que fica como proposta (decisão do Victor)

- ~~Pular a Academia~~: **feito na v65** (OK do Victor em 15/11). Botão no cartão e na lista de Missões, com um 2º toque;
  o servidor dá a Kunai de Treino, +100 ryō e +50 XP e leva à Praça.
- ~~Fragmentos gravados no banco~~: **feito na v65** (migração v39). +30 ryō e +60 XP no 1º achado de cada um e as falas
  do Cronista (`CRN_F_*`).
- **Uma sala de prática livre** na Academia (um boneco que revida de leve, sem portão), entre a Sala de Armas e a saída.
