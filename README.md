# 🥚 EGGNITE — Caçada no Planeta Xor-9

Um **jogo de tiro em primeira pessoa (FPS)** que roda direto no navegador — no
celular ou no computador — **sem servidor, sem banco de dados e sem instalação**.
Tudo é estático: basta hospedar no GitHub Pages e jogar.

Você pousou em **Xor-9**, um mundo distante infestado por **Ovomorfos** —
monstros em forma de ovo que **explodem em gosma** quando atingidos. Escolha sua
arma, recarregue, mire e detone cada um antes que cheguem até você.

## ▶️ Jogar

- **Online (GitHub Pages):** após o deploy, acesse
  `https://<seu-usuario>.github.io/<nome-do-repo>/`
- **Local:** é preciso servir por HTTP (módulos ES não abrem via `file://`):
  ```bash
  # na raiz do projeto
  python3 -m http.server 8000
  # abra http://localhost:8000
  ```

## 🎮 Controles

**Celular (toque):**
- Joystick esquerdo — mover (empurre até a borda para correr)
- Arrastar na tela — mirar/olhar
- 🔥 atirar · 🎯 mira precisa · ⟳ recarregar · ⤒ pular
- Botões `1 2 3` — trocar de arma

**Teclado / Mouse:**
- `WASD` mover · `Mouse` mirar · `Clique` atirar · `Botão direito` mira precisa
- `R` recarregar · `1 2 3` / `Q` trocar arma · `Espaço` pular · `Shift` correr
- `Esc` pausa

## 🔫 Armas

| Arma | Munição | Cadência | Dano | Destaque |
|------|---------|----------|------|----------|
| Pistola XR-9 | 12 | semi-auto | médio | precisa e equilibrada |
| Fuzil VK-7 | 30 | automática | baixo | cospe chumbo |
| Dispersor T-12 | 6 | tiro a tiro | alto (9 projéteis) | devastador de perto |

Munição reserva é **infinita** — foque em mirar e recarregar na hora certa.

## 👾 Inimigos

Ovomorfos em várias "raças" (comum, veloz, tanque e ácida) com vida, velocidade
e tamanho diferentes. As ondas ficam progressivamente mais difíceis. Cada ovo
**explode em gosma e cacos de casca** ao ser destruído.

## 🛠️ Tecnologia

- **[Three.js](https://threejs.org/)** (via CDN, sem build) para a renderização 3D.
- **Web Audio API** para sons **sintetizados em tempo real** — nenhum arquivo de
  áudio é necessário.
- HTML/CSS/JS puro. Zero dependências instaláveis, zero back-end.

Estrutura:

```
index.html          # ponto de entrada + HUD/telas
css/style.css       # estilo + controles de toque
assets/egg.svg      # ícone
src/
  main.js           # loop, estados e ondas
  environment.js    # planeta, terreno, céu, luas, atmosfera
  player.js         # movimento, câmera, colisão, recuo
  weapons.js        # armas, tiro (raycast), recarga, mira
  enemies.js        # ovomorfos (IA, formato de ovo, explosão)
  effects.js        # explosões, gosma, partículas, fumaça
  audio.js          # sons sintetizados
  input.js          # teclado/mouse + toque
  ui.js             # HUD e telas
```

## 🚀 Deploy no GitHub Pages

1. Faça push deste repositório para o GitHub.
2. Vá em **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **GitHub Actions**.
4. O workflow em `.github/workflows/deploy-pages.yml` publica o site
   automaticamente a cada push. O link aparece ao final da execução em **Actions**.

> Alternativa simples: em **Settings → Pages**, escolha *Deploy from a branch*,
> selecione a branch e a pasta `/ (root)`.
