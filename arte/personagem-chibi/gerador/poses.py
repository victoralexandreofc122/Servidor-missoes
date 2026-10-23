"""Poses (repouso + animações) do chibi. Canvas 64x96, chão na linha 92 (base da sola).

Convenções (mantidas das versões aprovadas):
  ANDAR/CORRER  frame 1 = perna visível (esquerda da tela / perna de perto) à frente,
                frame 2 = passagem (serve pra ir ou voltar), frame 3 = perna em sombra à frente.
  ATAQUE        frame 1 = soco, frame 2 = mão volta pro corpo (guarda + antecipação), frame 3 = chute alto.
  PARADO        frame 1 = neutro, frame 2 = expira (-1 px), frame 3 = braços acomodam.
Lado: o boneco olha pra ESQUERDA (frente = -x); pra direita o jogo espelha.
"""
import math

from body import Figure, mirror_pt
from compose import CORPO, FRENTE, TOPO, TRAS
from geom import lerp


def straight(a, b, l1, l2):
    """Junta do meio num membro reto (escorço: encurta sem dobrar pro lado)."""
    return lerp(a, b, l1 / (l1 + l2))


def leg_straight(fig, side, ank, plane=CORPO, **kw):
    hp = fig.hipj(side)
    L = fig.R.len
    return fig.leg(side, ank, knee=straight(hp, ank, L["thigh"], L["shin"]), plane=plane, **kw)


def arm_straight(fig, side, wr, plane=CORPO, **kw):
    sh = fig.shoulder(side)
    L = fig.R.len
    return fig.arm(side, wr, el=straight(sh, wr, L["upper"], L["fore"]), plane=plane, **kw)


def d(theta):
    """Direção a partir do ângulo em graus: 0 = pra baixo, +90 = pra direita (+x), -90 = pra esquerda."""
    t = math.radians(theta)
    return (math.sin(t), math.cos(t))


def arm_ang(fig, side, a_up, bend=0.0, plane=CORPO, **kw):
    """Braço por ângulos: a_up = direção do braço (0 = caído), bend = quanto o antebraço gira em relação a ele."""
    sh = fig.shoulder(side)
    L = fig.R.len
    du, df = d(a_up), d(a_up + bend)
    el = (sh[0] + du[0] * L["upper"], sh[1] + du[1] * L["upper"])
    wr = (el[0] + df[0] * L["fore"], el[1] + df[1] * L["fore"])
    return fig.arm(side, wr, el=el, plane=plane, **kw)


def leg_ang(fig, side, a_th, bend=0.0, plane=CORPO, scale=1.0, **kw):
    hp = fig.hipj(side)
    L = fig.R.len
    du, df = d(a_th), d(a_th + bend)
    kn = (hp[0] + du[0] * L["thigh"] * scale, hp[1] + du[1] * L["thigh"] * scale)
    an = (kn[0] + df[0] * L["shin"] * scale, kn[1] + df[1] * L["shin"] * scale)
    return fig.leg(side, an, knee=kn, plane=plane, **kw)


def rest_arm(fig, side, plane=FRENTE, dx=0.0, dy=0.0, **kw):
    """Braço na posição de repouso (relativo ao ombro), com deslocamento opcional da mão."""
    r = fig.R.rest
    m = (lambda p: p) if side in ("L", "near", "far") else mirror_pt
    sh0 = m(r["sh"])
    sh = fig.shoulder(side)
    off = (sh[0] - sh0[0], sh[1] - sh0[1])
    k = -1 if side == "R" else 1
    el = (m(r["el"])[0] + off[0] - k * dx * 0.5, m(r["el"])[1] + off[1] + dy * 0.5)
    wr = (m(r["wr"])[0] + off[0] - k * dx, m(r["wr"])[1] + off[1] + dy)
    return fig.arm(side, wr, el=el, plane=plane, **kw)


def rest_leg(fig, side, plane=CORPO, **kw):
    r = fig.R.rest
    m = (lambda p: p) if side in ("L", "near") else mirror_pt
    hp0 = m(r["hipj"]) if side != "far" else (r["hipj"][0] - 2, r["hipj"][1])
    hp = fig.hipj(side)
    off = (hp[0] - hp0[0], hp[1] - hp0[1])
    knee = m(r["knee"]) if side != "far" else (r["knee"][0] - 2, r["knee"][1])
    ank = m(r["ank"]) if side != "far" else (r["ank"][0] - 2, r["ank"][1])
    return fig.leg(side, (ank[0] + off[0], 88.5), knee=(knee[0] + off[0], knee[1] + off[1] * 0.5), plane=plane, **kw)


def rest_pose(g, view, hip=None, breath=0, arm_out=0.0):
    fig = Figure(g, view, hip=hip)
    fig.breath = breath
    if view in ("front", "back"):
        rest_leg(fig, "L")
        rest_leg(fig, "R")
        rest_arm(fig, "L", dx=arm_out)
        rest_arm(fig, "R", dx=arm_out)
    else:
        rest_arm(fig, "far", plane=TRAS, far=True, dx=arm_out)
        rest_leg(fig, "far", plane=TRAS, far=True)
        rest_leg(fig, "near")
        rest_arm(fig, "near", dx=arm_out)
    return fig


# ---------------------------------------------------------------- PARADO
def idle(g, view, f):
    breath = (0, 1, 1)[f]
    arm_out = (0.0, 0.0, 0.8)[f]
    return rest_pose(g, view, breath=breath, arm_out=arm_out)


# ---------------------------------------------------------------- ANDAR
def walk(g, view, f):
    if view == "side":
        hip_y = (77.0, 76.0, 77.0)[f]
        fig = Figure(g, "side", hip=(31.0, hip_y))
        near_ank, near_ang = [((28.0, 88.5), -8), ((32.5, 88.5), 0), ((37.0, 87.6), 18)][f]
        far_ank, far_ang = [((35.0, 87.6), 18), ((30.0, 85.0), 22), ((26.0, 88.5), -8)][f]
        near_a = [(22, -8), (2, -4), (-24, -20)][f]     # (ângulo do braço, dobra do cotovelo)
        far_a = [(-24, -20), (2, -4), (22, -8)][f]
        arm_ang(fig, "far", *far_a, plane=TRAS, far=True)
        fig.leg("far", far_ank, plane=TRAS, far=True, foot_ang=far_ang)
        fig.leg("near", near_ank, foot_ang=near_ang)
        arm_ang(fig, "near", *near_a, plane=FRENTE)
        return fig
    sgn = 1 if view == "front" else -1          # perna que avança vem pra câmera (frente) ou vai pra longe (costas)
    step = [(1, -1), (0, -0.6), (-1, 1)][f]     # (perna esquerda da tela, perna direita): +1 avança, -1 recua
    swing = [(-1, 1), (0, 0), (1, -1)][f]       # braços opostos às pernas
    fig = Figure(g, view, hip=(32.0, (76.0, 75.0, 76.0)[f]))
    for side, s in (("L", step[0]), ("R", step[1])):
        toward = s * sgn                         # >0: pé vem pra câmera (desce e cresce); <0: vai pra longe
        fs = 1.0 + 0.08 * toward
        ay = 92.5 - 4.0 * fs if toward > 0 else 88.5 + 1.6 * toward   # pé que vem pra câmera cresce, sola no chão
        hx = fig.hipj(side)[0]
        k = -1 if side == "L" else 1
        leg_straight(fig, side, (hx + k * 1.0, ay), fs=fs)
    for side, s in (("L", swing[0]), ("R", swing[1])):
        toward = s * sgn
        k = -1 if side == "L" else 1
        sh = fig.shoulder(side)
        if toward < 0:      # braço indo pra longe da câmera: passa por trás do tronco, só o ombro aparece
            arm_straight(fig, side, (sh[0] - k * 3.0, sh[1] + 13.5), plane=TRAS)
        elif toward > 0:    # vindo pra câmera: inclina de leve pra frente do corpo (mão entra na frente do quadril)
            rest_arm(fig, side, dx=-2.6, dy=-2.6, fs=1.08)
        else:               # passagem: braços quase caídos, cotovelo levemente dobrado (não fica igual ao parado)
            rest_arm(fig, side, dx=-0.8, dy=-0.8)
    return fig


def grounded(build, ground=88.5):
    """Monta a pose, mede o tornozelo mais baixo e reposiciona pra ele ficar no chão."""
    fig = build(0.0)
    low = max(l.j["ank"][1] + (l.kw.get("lift", 0)) for l in fig.limbs if l.kind == "leg" and not l.kw.get("air"))
    return build(ground - low)


# ---------------------------------------------------------------- CORRER (estilo Naruto)
def run(g, view, f):
    if view == "side":
        # (perna de perto, perna de longe): (ângulo da coxa, dobra do joelho, ângulo do pé, no ar?)
        FWD = (-34, 26, -10, False)       # perna esticada à frente tocando o chão
        BACK = (26, 62, 34, True)         # perna chutando pra trás, pé no ar
        SUP = (-6, 22, 0, False)          # apoio embaixo do corpo
        PASS = (-52, 92, 25, True)        # joelho passando à frente, alto
        near, far = [(FWD, BACK), (SUP, PASS), (BACK, FWD)][f]
        bob = (-1.0, 0.0, -1.0)[f]

        def build(dy):
            fig = Figure(g, "side", hip=(32.0, 76.0 + dy + bob), lean=22)
            arm_ang(fig, "far", 52, 6, plane=TRAS, far=True)
            a, b, fa, air = far
            leg_ang(fig, "far", a, b, plane=TRAS, far=True, foot_ang=fa, air=air)
            a, b, fa, air = near
            leg_ang(fig, "near", a, b, foot_ang=fa, air=air)
            arm_ang(fig, "near", 60, 4, plane=FRENTE)
            return fig
        return grounded(build)
    sgn = 1 if view == "front" else -1
    lift = [(1, 0), (0, 0.4), (0, 1)][f]       # qual joelho sobe (vem pra câmera na frente, vai pra longe nas costas)
    fig = Figure(g, view, hip=(32.0, (76.0, 77.0, 76.0)[f]), lean=24)
    for side, up in (("L", lift[0]), ("R", lift[1])):
        k = -1 if side == "L" else 1
        hx = fig.hipj(side)[0]
        if up >= 1:
            if sgn > 0:   # joelho vem pra câmera: coxa encurta, pé sobe e cresce
                leg_straight(fig, side, (hx + k * 0.5, 82.0), fs=1.12)
            else:         # joelho vai pra longe: some atrás, só a canela encurtada aparece
                leg_straight(fig, side, (hx + k * 0.5, 81.0), fs=0.88, plane=TRAS)
        else:
            leg_straight(fig, side, (hx + k * 1.0, 88.5 - 1.2 * up))
    for side in ("L", "R"):    # braços esticados pra trás
        k = -1 if side == "L" else 1
        sh = fig.shoulder(side)
        if sgn > 0:   # de frente: corpo inclinado e braços esticados pra trás -> sobem atrás do corpo e as mãos
            #             aparecem dos lados do rosto, por trás da cabeça (alternam 1 px pra dar balanço)
            up = [(1.0, 0.0), (0.5, 0.5), (0.0, 1.0)][f][0 if side == "L" else 1]
            el = (sh[0] + k * 7.0, sh[1] - 3.5 - up * 0.5)
            wr = (sh[0] + k * 12.0, sh[1] - 9.0 - up)
            fig.arm(side, wr, el=el, plane=TRAS, fs=0.9, end_dir=(k * 0.55, -1.0))
        else:         # de costas vêm pra câmera: maiores, por cima do corpo
            arm_straight(fig, side, (sh[0] + k * 5.5, sh[1] + 14.0), plane=FRENTE, fs=1.1)
    return fig


# ---------------------------------------------------------------- ATAQUE (soco, mão volta pro corpo, chute alto)
def attack(g, view, f):
    if view == "side":
        if f == 0:      # soco com o braço de perto, reto na altura do peito
            fig = Figure(g, "side", hip=(31.5, 76.0), lean=8)
            arm_ang(fig, "far", 28, -112, plane=TRAS, far=True, hand="fist")          # punho recolhido no peito
            fig.leg("far", (36.5, 88.0), plane=TRAS, far=True, foot_ang=16)
            fig.leg("near", (27.0, 88.5), foot_ang=-4)
            arm_ang(fig, "near", -86, 0, plane=FRENTE, hand="fist", fs=1.15)
            return fig
        if f == 1:      # guarda: punhos na frente do peito, agacha 1 px (antecipa o chute)
            fig = Figure(g, "side", hip=(31.5, 77.0), lean=4)
            arm_ang(fig, "far", -14, -128, plane=TRAS, far=True, hand="fist")
            fig.leg("far", (35.5, 88.5), plane=TRAS, far=True, foot_ang=6)
            fig.leg("near", (28.0, 88.5))
            arm_ang(fig, "near", -22, -122, plane=FRENTE, hand="fist")
            return fig
        # chute alto pra frente (pé na altura do peito), tronco pra trás, braços retos pra baixo
        fig = Figure(g, "side", hip=(32.0, 76.0), lean=-9)      # inclina pouco pra trás (cabelo cabe no quadro)
        arm_ang(fig, "far", 4, 0, plane=TRAS, far=True)
        fig.leg("far", (33.5, 88.5), plane=TRAS, far=True)
        leg_ang(fig, "near", -138, 4, plane=FRENTE, foot_ang=-134)   # pé alinhado com a canela (ponta limpa)
        arm_ang(fig, "near", 2, -4, plane=FRENTE)
        return fig

    front = view == "front"
    # de frente o soco/chute é do lado esquerdo da tela (mão/perna direita do personagem);
    # de costas o mesmo braço/perna fica do lado direito da tela
    P = "L" if front else "R"
    O = "R" if front else "L"
    kP = -1 if P == "L" else 1
    kO = -kP

    def stance(fig, wide=1.5):
        for s in ("L", "R"):
            k = -1 if s == "L" else 1
            leg_straight(fig, s, (fig.hipj(s)[0] + k * wide, 88.5))

    if f == 0:          # soco
        fig = Figure(g, view, hip=(32.0, 76.0))
        stance(fig)
        sP, sO = fig.shoulder(P), fig.shoulder(O)
        if front:       # punho vem pra câmera, grande, no meio do peito; o outro recolhe na cintura
            fig.arm(O, (sO[0] - kO * 0.5, sO[1] + 13.0), el=(sO[0] + kO * 2.5, sO[1] + 8.0), plane=FRENTE, hand="fist")
            fig.arm(P, (sP[0] - kP * 4.0, sP[1] + 6.0), el=(sP[0] - kP * 0.5, sP[1] + 5.0), plane=TOPO,
                    hand="fist_front", fs=1.45, end_dir=(-kP * 1.0, 0.6))
        else:           # soco pra longe: o braço some na frente do corpo (só o ombro aparece)
            fig.arm(P, (sP[0] - kP * 4.0, sP[1] + 8.0), el=(sP[0] - kP * 1.0, sP[1] + 6.0), plane=TRAS, hand="fist")
            fig.arm(O, (sO[0] - kO * 4.0, sO[1] + 13.5), el=(sO[0] + kO * 5.0, sO[1] + 9.5), plane=FRENTE, hand="fist")
        return fig
    if f == 1:          # guarda: mãos voltam pro corpo, punhos na frente do peito, agacha 1 px
        fig = Figure(g, view, hip=(32.0, 77.0))
        stance(fig, 1.8)
        for s in ("L", "R"):
            k = -1 if s == "L" else 1
            sh = fig.shoulder(s)
            if front:   # guarda de boxe: cotovelo embaixo, antebraço em pé, punho abaixo do queixo
                fig.arm(s, (sh[0] - k * 1.5, sh[1] + 6.5), el=(sh[0] + k * 2.5, sh[1] + 10.5), plane=FRENTE,
                        hand="fist", end_dir=(-k * 0.35, -1.0))
            else:       # de costas os punhos ficam escondidos na frente do peito; os cotovelos aparecem abertos
                fig.arm(s, (sh[0] - k * 3.5, sh[1] + 7.0), el=(sh[0] + k * 3.5, sh[1] + 9.0), plane=TRAS,
                        hand="fist")
        return fig
    # chute alto
    fig = Figure(g, view, hip=(32.0 - kP * 1.0, 76.0), lean=-8)
    hP = fig.hipj(P)
    if front:           # perna sobe em diagonal pra câmera: sola grande perto do peito, por cima de tudo
        fig.leg(P, (hP[0] + kP * 1.5, 58.5), knee=(hP[0] + kP * 3.0, 66.0), plane=TOPO, foot="sole", thick=1.2)
    else:               # de costas a perna vai pra frente: some atrás do corpo
        fig.leg(P, (hP[0], 72.0), knee=(hP[0], 74.0), plane=TRAS, foot="none")
    hO = fig.hipj(O)
    leg_straight(fig, O, (hO[0] - kO * 0.5, 88.5))
    for s in ("L", "R"):  # braços retos pra baixo; do lado do chute o braço abre e passa atrás da perna
        k = -1 if s == "L" else 1
        sh = fig.shoulder(s)
        if front and s == P:
            arm_straight(fig, s, (sh[0] + k * 7.0, sh[1] + 15.5), plane=CORPO)
        else:
            arm_straight(fig, s, (sh[0] + k * 4.0, sh[1] + 17.0), plane=FRENTE)
    return fig
