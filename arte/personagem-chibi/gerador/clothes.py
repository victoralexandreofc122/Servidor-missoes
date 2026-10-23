"""Roupas que acompanham o corpo em qualquer pose.

Cada peça é um molde desenhado na POSE DE REPOUSO (recortado das tabelas do próprio corpo da vista/gênero) e
levado pros ossos posados do mesmo jeito que o corpo: tronco pela coluna, mangas/calças/faixas/sandálias pelos
segmentos de braço e perna. Os detalhes (bolsos, fecho, dobras, punhos, logo) também são moldes de repouso,
então giram junto sem buraco. A sombra geral é recalculada pela pose (luz sempre de cima-esquerda).

Cada peça vai no MESMO plano do membro que ela veste, e é recortada pelas partes do corpo que ficam na frente
dela no mesmo plano (ex.: a cabeça na frente da gola; a mão na frente da barra da camisa).

Cores por canal: COR1, COR2, COR3 (+ FIXO pro aço e contorno, PELE pros dedos de fora da sandália).
Itens: conjunto_vila (conjunto da vila), camisa_basica (com logo) / camisa_basica_lisa, calca_basica.
"""
import numpy as np

from body import GROUND, bone_ts, edge_band, posed_bones, remap, seg_owner, shadow_dir, sole_stamp
from compose import CORPO, FRENTE, TOPO, TRAS, Part, clean_islands, compose
from geom import PX, PY, W, H, YY, blank, bone_frame, dilate, pts_mask, rows_mask
from pal import (COR1, COR2, COR3, F_OUT, F_ST, F_ST_DK, F_ST_LT, F_ST_SH, FIXO, K_BASE, K_DK, K_HI, K_LT, K_SH,
                 P_BASE, P_L1, PELE)


# =====================================================================================
# moldes de repouso
# =====================================================================================
def sel(rows, y0, y1):
    return {y: v for y, v in rows.items() if y0 <= y <= y1}


def grow(rows, l=0, r=0):
    return {y: (a - l, b + r) for y, (a, b) in rows.items()}


def front_like(fig):
    return fig.view in ("front", "back")


def T(fig, rest_m):
    """Molde de repouso do tronco -> pose."""
    r = fig.R.rest
    return remap(rest_m, r["neck"], r["hip"], fig.neck, fig.hip)


def Lm(fig, lb, spec):
    """{segmento: molde de repouso desenhado no lado ESQUERDO da tela} -> máscara posada (lado direito espelha)."""
    mir = front_like(fig) and lb.side == "R"
    pb = posed_bones(fig, lb)
    out = blank()
    for seg, m in spec.items():
        A0, B0 = fig.R.bones[seg]
        if mir:
            m = m[:, ::-1]
            A0, B0 = (64.0 - A0[0], A0[1]), (64.0 - B0[0], B0[1])
        A, B = pb[seg]
        if seg in ("foot", "hand"):
            ks = lb.kw.get("fs", 1.0)
        else:
            ks = lb.kw.get("thick", 1.0) if lb.kind == "leg" else 1.0
        out |= remap(m, A0, B0, A, B, ks)
    return out


def R(rows):
    return rows_mask(rows)


def P(pts):
    return pts_mask(pts)


def far_tone(idx, m, chans=(COR1, COR2, COR3)):
    """Membro de longe (vista de lado): um degrau mais escuro."""
    for ch in chans:
        s = m & (idx.ch == ch)
        sh = idx.sh.copy()
        for a, b in ((K_HI, K_LT), (K_LT, K_BASE), (K_BASE, K_SH), (K_SH, K_DK)):
            sh[s & (idx.sh == a)] = b
        idx.sh[s] = sh[s]


def rim_of(part):
    ip = getattr(part, "inner_px", None)
    if ip is None or not ip.any():
        return None
    return dilate(ip) & ~ip


def shade_limb(idx, interior, bones, ch, rim=None, k_sh=2):
    """Tecido num membro: faixa de sombra do lado oposto à luz e 1 px de luz do lado da luz."""
    own = seg_owner(bones)
    base = interior & ~rim if rim is not None else interior
    for i, (A, B) in enumerate(bones):
        L, u, n = bone_frame(A, B)
        d = shadow_dir(u)
        s = own == i
        dark = edge_band(base, d, k_sh) & s
        idx.put(dark, ch, K_SH)
        idx.put(edge_band(base, (-d[0], -d[1]), 1) & s & ~dark, ch, K_LT)


def torso_dir(fig):
    if fig.view == "side":
        L, u, n = bone_frame(fig.neck, fig.hip)
        return shadow_dir(u)
    return (1, 0)


# =====================================================================================
# montagem de um item num frame
# =====================================================================================
class Build:
    def __init__(self, fig, frame):
        self.fig, self.frame = fig, frame
        self.parts = []
        self.bp = {p.name: p for p in frame.body_parts}
        self.promote = []          # (peça, plano, máscara): pixels da gola que sobem pro plano do braço (ombro)
        self.arms = [l for l in fig.limbs if l.kind == "arm"]
        self.legs = [l for l in fig.limbs if l.kind == "leg"]

    def occluders(self, plane, zb, legs=True):
        """Partes do corpo no mesmo plano e na frente (z maior) da parte que a peça veste."""
        m = blank()
        for p in self.frame.body_parts:
            if p.plane != plane or p.z <= zb or p.name == "roupa_baixo":
                continue
            if not legs and p.name.startswith("perna"):
                continue
            m |= p.mask
        return m

    def limb(self, kind, name, spec_fn, z_off, paint_fn, inner=(FIXO, F_OUT), soft_fn=None, only=None):
        for lb in (self.arms if kind == "arm" else self.legs):
            if only is not None and not only(lb):
                continue
            spec = spec_fn(lb)
            if spec is None:
                continue
            m = spec if isinstance(spec, np.ndarray) else Lm(self.fig, lb, spec)
            m = m & (YY <= GROUND)
            if not m.any():
                continue
            body = self.bp["%s_%s" % ("braco" if kind == "arm" else "perna", lb.side)]
            p = Part("%s_%s" % (name, lb.side), m, body.z * 10 + z_off, body.plane, paint_fn(lb), inner=inner,
                     soft=soft_fn(lb) if soft_fn else None)
            p.cut = self.occluders(body.plane, body.z)
            p.limb = lb
            self.parts.append(p)

    def torso(self, name, rest_m, z_off, paint, inner=(FIXO, F_OUT), soft=None, top=False):
        m = T(self.fig, rest_m)
        body = self.bp["tronco"]
        z = 10 ** 6 + z_off if top else body.z * 10 + z_off
        p = Part(name, m, z, CORPO, paint, inner=inner, soft=soft)
        p.cut = self.bp["cabeca"].mask if top else self.occluders(CORPO, body.z, legs=False)
        self.parts.append(p)
        if top:   # a gola fica por cima do ombro: onde o braço (num plano da frente) encosta nela, ela sobe junto
            for a in self.arms:
                bpart = self.bp["braco_%s" % a.side]
                if bpart.plane <= CORPO:
                    continue
                j = a.j
                t, s = bone_ts(j["sh"], j["el"])
                own = seg_owner([(j["sh"], j["el"]), (j["el"], j["wr"]), (j["wr"], j["end"])])
                self.promote.append((p, bpart.plane, m & bpart.mask & (own == 0) & (t < 0.45), a))
        return m

    def done(self):
        for p, pl, m, a in self.promote:          # manga/ombreira não passam por cima da gola no ombro
            for q in self.parts:
                if getattr(q, "limb", None) is a:
                    q.mask = q.mask & ~m
        planes = compose(self.parts)
        for p, pl, m, a in self.promote:
            if hasattr(p, "drawn"):
                planes[pl].copy_from(p.tmp, p.drawn & m)
        # a cabeça fica na frente da gola: linha de contorno no queixo/nuca onde encosta na roupa
        head = self.bp["cabeca"].mask
        cloth = planes[CORPO].ch > 0
        line = head & dilate(cloth) & ~cloth
        planes[CORPO].put(line, FIXO, F_OUT)
        clean_islands(planes)
        return planes


def band_rows(rows_tbl, ys, l=0, r=0):
    """Linhas inteiras de uma tabela de repouso (pra marcar dobras/barras)."""
    return R({y: (a - l, b + r) for y, (a, b) in rows_tbl.items() if y in ys})


def full_rows(ys):
    return R({y: (0, W - 1) for y in ys})


# =====================================================================================
# peças genéricas
# =====================================================================================
def sleeve_spec(fig, bottom=66):
    arm = fig.R.arm_rows
    return {"upper": R(sel(arm, 49, 59)), "fore": R(sel(arm, 57, bottom))}


def cap_spec(fig):
    arm = fig.R.arm_rows
    if front_like(fig):
        return {"upper": R(sel(arm, 50, 53))}
    return {"upper": R(grow(sel(arm, 50, 54), 1, 1))}


def pants_leg_rows(fig, bottom, thigh_out=1, shin_out=1, shin_in=0, balloon=()):
    """Tabelas de repouso da perna da calça (lado esquerdo). Frente/costas: cresce pra fora (esquerda) e,
    no balão, 1 px pra dentro; de lado: cresce pros dois lados (frente e trás da perna)."""
    leg = fig.R.leg_rows
    fl = front_like(fig)
    th, sh = {}, {}
    for y, (a, b) in sel(leg, 75, 82).items():
        o = thigh_out if 77 <= y <= 82 else 0
        th[y] = (a - o, b + (0 if fl else o))
    for y, (a, b) in sel(leg, 81, bottom).items():
        o = shin_out + (1 if y in balloon else 0)
        i = shin_in if y in balloon else 0
        if y == bottom and y not in balloon:
            o = max(o - 1, 0)
        sh[y] = (a - o, b + (i if fl else o))
    return th, sh


def cloth_limb_paint(fig, ch, extra=None):
    def make(lb):
        pb = posed_bones(fig, lb)
        bones = [pb["upper"], pb["fore"]] if lb.kind == "arm" else [pb["thigh"], pb["shin"]]

        def paint(idx, part, vis, interior):
            idx.put(part.mask, ch, K_BASE)
            shade_limb(idx, interior, bones, ch, rim_of(part))
            if extra:
                extra(lb, idx, part, interior)
            if lb.far:
                far_tone(idx, part.mask)
        return paint
    return make


def sole_or_foot(fig, lb):
    foot = lb.kw.get("foot", "flat")
    if foot == "none":
        return None
    if foot == "sole":
        return sole_stamp(lb)[0]
    return {"foot": R(sel(fig.R.leg_rows, 89, 92))}


def sandal_paint(fig, ch):
    def make(lb):
        def paint(idx, part, vis, interior):
            if lb.kw.get("foot") == "sole":         # chute de frente: sola da sandália virada pra câmera
                sm, px = sole_stamp(lb)
                for (x, y), c in px.items():
                    if c == "O":
                        idx.ch[y, x], idx.sh[y, x] = FIXO, F_OUT
                    elif c == ".":
                        idx.ch[y, x], idx.sh[y, x] = PELE, P_BASE
                    elif c == "e":
                        idx.ch[y, x], idx.sh[y, x] = ch, K_SH
                    else:
                        idx.ch[y, x], idx.sh[y, x] = ch, K_BASE
                return
            A, B = posed_bones(fig, lb)["foot"]
            t, s = bone_ts(A, B)
            idx.put(part.mask, ch, K_BASE)
            if fig.view == "front":
                idx.put(interior & (t < 0.40), ch, K_LT)
                idx.put(edge_band(interior, (1, 0), 1) & (t < 0.65), ch, K_SH)
                toes = interior & (t > 0.65)
                idx.put(toes, PELE, P_BASE)
                idx.put(edge_band(toes, (1, 0), 2), PELE, P_L1)
            elif fig.view == "side":                # dedos na ponta (frente = esquerda), sola embaixo
                idx.put(interior & (t < 0.40), ch, K_LT)
                toes = interior & (s < -3.5) & (t > 0.30) & (t < 0.70)
                idx.put(toes, PELE, P_BASE)
                idx.put(toes & (s > -4.5), PELE, P_L1)
                idx.put(interior & (t >= 0.70), ch, K_DK)
            else:                                   # costas: calcanhar
                idx.put(interior & (t < 0.40), ch, K_LT)
                idx.put(interior & (t > 0.65), ch, K_SH)
                idx.put(edge_band(interior, (1, 0), 1), ch, K_SH)
            if lb.far:
                far_tone(idx, part.mask)
        return paint
    return make


def wrap_paint(fig, ch, seam_rows):
    """Faixa/amarração enrolada na canela: sombra embaixo da barra da calça + emenda em degrau."""
    a, b = seam_rows

    def make(lb):
        seam = Lm(fig, lb, {"shin": P([(23, a), (24, a), (25, a), (26, b), (27, b), (28, b)])})
        if fig.view == "side":
            seam = Lm(fig, lb, {"shin": P([(29, a), (30, a), (31, a), (32, b), (33, b), (34, b), (35, b)])})
        top = Lm(fig, lb, {"shin": full_rows((min(seam_rows) - 1,))})

        def paint(idx, part, vis, interior):
            idx.put(part.mask, ch, K_BASE)
            ys = np.where(interior.any(axis=1))[0]
            idx.put(interior & top, ch, K_SH)
            idx.put(interior & seam, ch, K_SH)
            idx.put(edge_band(interior, (1, 0), 1), ch, K_SH)
            if lb.far:
                far_tone(idx, part.mask)
        return paint
    return make


# =====================================================================================
# CONJUNTO DA VILA (cor 1 = colete, cor 2 = camisa/calça/sandálias, cor 3 = faixas e fita)
# cada vila tem as cores dela, travadas (o jogador não troca)
# =====================================================================================
COLLAR_F = {47: (24, 39), 48: (24, 39), 49: (24, 39), 50: (24, 39), 51: (25, 38)}
COLLAR_S = {46: (28, 36), 47: (27, 37), 48: (27, 37), 49: (27, 37), 50: (27, 37), 51: (26, 37)}
POCKETS_F = (26, 33)        # x inicial dos 2 bolsos de pergaminho (5 px de largura), linhas 55..62


def holster_rest(fig):
    """Porta-kunai na coxa ESQUERDA do personagem (molde no lado esquerdo da tela; na frente é espelhado)."""
    if fig.view == "side":
        return dict(pouch=R({y: (30, 35) for y in range(76, 83)}), tape=R({y: (28, 37) for y in (77, 78, 79)}),
                    flap=(77, 78), edge=79, button=(32, 78), shadow=P([(29, y) for y in (80, 81, 82)]),
                    tape_sh=P([(29, y) for y in (77, 78, 79)]))
    return dict(pouch=R({y: (20, 25) for y in range(76, 83)}), tape=R({y: (21, 30) for y in (77, 78, 79)}),
                flap=(77, 78), edge=79, button=(23, 78), shadow=P([(26, y) for y in (80, 81, 82)]),
                tape_sh=P([(26, y) for y in (77, 78, 79)] + [(27, y) for y in (77, 78, 79)]))


def conjunto_ninja(fig, frame):
    b = Build(fig, frame)
    v = fig.view
    hol_side = {"front": "R", "back": "L", "side": "near"}[v]
    H_ = holster_rest(fig)
    torso_rows = fig.R.torso_rows

    # ---------------- calça ----------------
    def p_pelvis(idx, part, vis, interior):
        idx.put(part.mask, COR2, K_BASE)
        idx.put(edge_band(interior, torso_dir(fig), 2), COR2, K_SH)
        idx.put(interior & T(fig, full_rows((71,))), COR2, K_SH)              # sombra da barra do colete
        if v != "side":
            idx.put(part.mask & T(fig, P([(30, 76), (31, 76), (32, 76), (33, 76)])), FIXO, F_OUT)
    b.torso("calca_quadril", R(grow(sel(torso_rows, 69, 76), 0, 1 if v == "side" else 0)), 0, p_pelvis)

    def pants_extra(lb, idx, part, interior):
        idx.put(interior & Lm(fig, lb, {"shin": full_rows((82,))}), COR2, K_SH)   # o pano embolsa sobre a faixa
        if v == "front":
            pts = [(26, 80), (27, 81)] if lb.side == "L" else [(24, 80), (25, 81)]
        elif v == "back":
            pts = [(25, 80), (26, 81)]
        else:
            pts = [(31, 80), (32, 81)]
        idx.put(interior & Lm(fig, lb, {"thigh": P(pts)}), COR2, K_SH)              # dobras
        if lb.side == hol_side:
            idx.put(interior & Lm(fig, lb, {"thigh": H_["shadow"]}), COR2, K_SH)    # sombra do porta-kunai

    def pants_spec(lb):
        th, sh = pants_leg_rows(fig, 83, 1, 0)
        return {"thigh": R(th), "shin": R(sh)}
    b.limb("leg", "calca", pants_spec, 5, cloth_limb_paint(fig, COR2, pants_extra))
    b.limb("leg", "faixa", lambda lb: {"shin": R(sel(fig.R.leg_rows, 84, 88))}, 3, wrap_paint(fig, COR3, (86, 85)))
    b.limb("leg", "sandalia", lambda lb: sole_or_foot(fig, lb), 1, sandal_paint(fig, COR2))

    def tape_paint(lb):
        def paint(idx, part, vis, interior):
            idx.put(part.mask, COR3, K_BASE)
            idx.put(interior & Lm(fig, lb, {"thigh": H_["tape_sh"]}), COR3, K_SH)
            idx.put(edge_band(interior, (1, 0), 1), COR3, K_SH)
            if lb.far:
                far_tone(idx, part.mask)
        return paint

    def pouch_paint(lb):
        def paint(idx, part, vis, interior):
            idx.put(part.mask, FIXO, F_ST_DK)
            flap = Lm(fig, lb, {"thigh": full_rows(H_["flap"])})
            edge = Lm(fig, lb, {"thigh": full_rows((H_["edge"],))})
            idx.put(interior & flap, FIXO, F_ST_SH)
            idx.put(interior & edge, COR2, K_DK)
            idx.put(edge_band(interior, (1, 0), 1) & ~flap & ~edge, COR2, K_SH)
            idx.put(interior & Lm(fig, lb, {"thigh": P([H_["button"]])}), FIXO, F_ST_LT)
        return paint
    hol = lambda lb: lb.side == hol_side
    b.limb("leg", "fita", lambda lb: {"thigh": H_["tape"]}, 6, tape_paint, only=hol)
    b.limb("leg", "porta_kunai", lambda lb: {"thigh": H_["pouch"]}, 7, pouch_paint, only=hol)

    # ---------------- mangas (cor 2) e ombreiras (cor 1) ----------------
    def sleeve_extra(lb, idx, part, interior):
        arm = fig.R.arm_rows
        idx.put(interior & Lm(fig, lb, {"fore": band_rows(arm, (64,), 1, 1)}), COR2, K_SH)    # dobra do punho
        lt = interior & Lm(fig, lb, {"fore": band_rows(arm, (65,), 1, 1)})
        A, B = posed_bones(fig, lb)["fore"]
        idx.put(lt & ~edge_band(interior, shadow_dir(bone_frame(A, B)[1]), 1), COR2, K_LT)
    b.limb("arm", "manga", lambda lb: sleeve_spec(fig), 1, cloth_limb_paint(fig, COR2, sleeve_extra))

    vest_rest = R(grow(sel(torso_rows, 49, 70), 1 if v == "side" else 0, 1 if v == "side" else 0))
    vest_posed = T(fig, vest_rest)
    collar_rest = R(COLLAR_F if front_like(fig) else COLLAR_S)
    collar_posed = T(fig, collar_rest)

    def cap_paint(lb):
        def paint(idx, part, vis, interior):
            idx.put(part.mask, COR1, K_BASE)
            if front_like(fig) and lb.side == "R":
                idx.put(interior, COR1, K_SH)
            else:
                idx.put(edge_band(interior, (0, -1), 1), COR1, K_LT)
                idx.put(edge_band(interior, (1, 0), 1) | edge_band(interior, (0, 1), 1), COR1, K_SH)
            if lb.far:
                far_tone(idx, part.mask)
        return paint
    b.limb("arm", "ombreira", lambda lb: Lm(fig, lb, cap_spec(fig)) & ~collar_posed, 2, cap_paint,
           soft_fn=lambda lb: vest_posed)

    # ---------------- colete ----------------
    def p_vest(idx, part, vis, interior):
        idx.put(part.mask, COR1, K_BASE)
        d = torso_dir(fig)
        if v == "front":
            right = T(fig, R({y: (32, 63) for y in range(40, 80)}))
            idx.put(edge_band(interior & right, (1, 0), 2), COR1, K_SH)
            idx.put(interior & T(fig, band_rows(torso_rows, (52,))), COR1, K_SH)                 # sombra da gola
            idx.put(edge_band(interior, (-1, 0), 1) & T(fig, full_rows(range(63, 69))), COR1, K_LT)
            idx.put(interior & T(fig, R({y: (32, 32) for y in range(52, 70)})), COR1, K_DK)      # fecho
            idx.put(interior & T(fig, R({y: (31, 31) for y in range(53, 70)})), COR1, K_LT)
            for a in POCKETS_F:                                                                 # bolsos
                pk = R({y: (a, a + 4) for y in range(55, 63)})
                inner_ = R({y: (a + 1, a + 3) for y in range(56, 62)})
                idx.put(T(fig, pk) & vis, COR1, K_BASE)
                idx.put(T(fig, pk & ~inner_) & vis, COR1, K_DK)
                idx.put(T(fig, R({56: (a + 1, a + 3)})) & vis, COR1, K_LT)
                idx.put(T(fig, R({57: (a, a + 4)})) & vis, COR1, K_DK)
                idx.put(T(fig, R({y: (a + 3, a + 3) for y in range(58, 62)})) & vis, COR1, K_SH)
            idx.put(interior & T(fig, band_rows(torso_rows, (69,))), COR1, K_SH)                 # barra
        elif v == "back":
            idx.put(edge_band(interior, (1, 0), 2), COR1, K_SH)
            idx.put(interior & T(fig, band_rows(torso_rows, (52,))), COR1, K_SH)
            idx.put(interior & T(fig, band_rows(torso_rows, (60,))), COR1, K_SH)                 # recorte das costas
            idx.put(interior & T(fig, band_rows(torso_rows, (61,))), COR1, K_LT)
            idx.put(interior & T(fig, R({y: (31, 32) for y in range(53, 60)})), COR1, K_SH)     # costura
            idx.put(edge_band(interior, (-1, 0), 1) & T(fig, full_rows(range(62, 69))), COR1, K_LT)
            idx.put(interior & T(fig, band_rows(torso_rows, (69,), 1, 1)), COR1, K_SH)
        else:
            idx.put(edge_band(interior, d, 2), COR1, K_SH)
            idx.put(edge_band(interior, (-d[0], -d[1]), 1), COR1, K_LT)
            pk = R({y: (22, 26) for y in range(55, 63)})                                        # bolso no peito
            inner_ = R({y: (21, 25) for y in range(56, 62)})
            idx.put(T(fig, pk & ~inner_) & interior, COR1, K_DK)
            idx.put(T(fig, R({56: (22, 25)})) & interior, COR1, K_LT)
            idx.put(T(fig, R({57: (22, 26)})) & interior, COR1, K_DK)
            idx.put(interior & T(fig, band_rows(torso_rows, (52,), 1, 1)), COR1, K_SH)
            idx.put(interior & T(fig, band_rows(torso_rows, (69,), 1, 1)), COR1, K_SH)
    b.torso("colete", vest_rest, 10, p_vest)

    def p_collar(idx, part, vis, interior):
        idx.put(part.mask, COR1, K_BASE)
        idx.put(edge_band(interior, (0, -1), 1), COR1, K_LT)
        if front_like(fig):
            idx.put(interior & T(fig, R({y: (36, 63) for y in range(40, 60)})), COR1, K_SH)
            idx.put(interior & T(fig, R({50: (25, 35)})), COR1, K_SH)
            if v == "front":
                idx.put(part.mask & T(fig, P([(31, 48), (32, 48), (31, 49), (32, 49)])), COR2, K_DK)  # abertura em V
                idx.put(part.mask & T(fig, P([(31, 50), (32, 50)])), COR1, K_DK)
        else:
            idx.put(edge_band(interior, (1, 0), 2), COR1, K_SH)
            idx.put(interior & T(fig, R({50: (26, 33)})), COR1, K_SH)
    b.torso("gola", collar_rest, 0, p_collar, inner=(COR1, K_DK), top=True)
    return b.done()


# =====================================================================================
# CAMISA BÁSICA (cor 1 = camisa, cor 2 = logo da vila, cor 3 = gola e punhos)
# =====================================================================================
SYMBOLS = {"espiral": ["XXXXX", "....X", "XXX.X", "X...X", "XXXXX"]}   # símbolos de vila (mesmos da bandana)
LOGO = SYMBOLS["espiral"]
NECK_F = {48: (26, 37), 49: (26, 37), 50: (27, 36)}
NECK_S = {47: (28, 36), 48: (27, 36), 49: (27, 36), 50: (28, 36)}


def logo_mask(x0, y0, cols=None, symbol="espiral"):
    pts = []
    for j, s in enumerate(SYMBOLS[symbol]):
        cs = range(5) if cols is None else cols
        for k, i in enumerate(cs):
            if s[i] == "X":
                pts.append((x0 + k, y0 + j))
    return P(pts)


def camisa_basica(fig, frame, symbol="espiral"):
    b = Build(fig, frame)
    v = fig.view
    torso_rows = fig.R.torso_rows

    def cuff_extra(lb, idx, part, interior):
        arm = fig.R.arm_rows
        cuff = part.mask & Lm(fig, lb, {"fore": band_rows(arm, (65, 66), 1, 1)})
        idx.put(cuff, COR3, K_BASE)
        A, B = posed_bones(fig, lb)["fore"]
        d = shadow_dir(bone_frame(A, B)[1])
        idx.put(cuff & interior & edge_band(interior, d, 2), COR3, K_SH)
        idx.put(interior & Lm(fig, lb, {"fore": band_rows(arm, (64,), 1, 1)}), COR1, K_SH)
        if lb.far:
            far_tone(idx, cuff)

    def arm_soft(lb):
        j = lb.j
        t, s = bone_ts(j["sh"], j["el"])
        own = seg_owner([(j["sh"], j["el"]), (j["el"], j["wr"]), (j["wr"], j["end"])])
        soft_t = 0.72 if front_like(fig) else 0.3
        return (t < soft_t) & (t > -0.6) & (own == 0)
    b.limb("arm", "manga", lambda lb: sleeve_spec(fig), 1, cloth_limb_paint(fig, COR1, cuff_extra), soft_fn=arm_soft)

    def p_shirt(idx, part, vis, interior):
        idx.put(part.mask, COR1, K_BASE)
        d = torso_dir(fig)
        idx.put(edge_band(interior, d, 2), COR1, K_SH)
        idx.put(edge_band(interior, (-d[0], -d[1]), 1) & T(fig, full_rows(range(60, 72))), COR1, K_LT)
        idx.put(interior & T(fig, band_rows(torso_rows, (72,), 1, 1)), COR1, K_SH)               # barra
        if v == "front":
            idx.put(interior & T(fig, band_rows(torso_rows, (51,))), COR1, K_SH)                # sombra da gola
            if symbol:
                idx.put(interior & T(fig, logo_mask(33, 55, symbol=symbol)), COR2, K_BASE)      # logo no peito
                idx.put(interior & T(fig, P([(33 + i, 60) for i in range(5)])), COR1, K_SH)
            idx.put(interior & T(fig, P([(28, 66), (29, 67), (35, 66), (34, 67)])), COR1, K_SH)  # dobras
        elif v == "back":
            idx.put(interior & T(fig, band_rows(torso_rows, (51,))), COR1, K_SH)
            idx.put(interior & T(fig, P([(28, 62), (29, 63), (35, 62), (34, 63)])), COR1, K_SH)
        else:
            if symbol:
                idx.put(interior & T(fig, logo_mask(23, 55, cols=(0, 2, 4), symbol=symbol)), COR2, K_BASE)
            idx.put(interior & T(fig, P([(27, 66), (28, 67)])), COR1, K_SH)
    b.torso("camisa", R(grow(sel(torso_rows, 49, 73), 1 if v == "side" else 0, 0)), 10, p_shirt)

    def p_neck(idx, part, vis, interior):
        idx.put(part.mask, COR3, K_BASE)
        idx.put(edge_band(interior, (1, 0), 2), COR3, K_SH)
        idx.put(edge_band(interior, (0, -1), 1), COR3, K_LT)
    b.torso("gola", R(NECK_F if front_like(fig) else NECK_S), 0, p_neck, top=True)
    return b.done()


# =====================================================================================
# CALÇA BÁSICA (cor 1 = calça, cor 2 = amarração do tornozelo e cordão, cor 3 = sandálias)
# =====================================================================================
def calca_basica(fig, frame):
    b = Build(fig, frame)
    v = fig.view
    torso_rows = fig.R.torso_rows

    def p_pelvis(idx, part, vis, interior):
        idx.put(part.mask, COR1, K_BASE)
        idx.put(edge_band(interior, torso_dir(fig), 2), COR1, K_SH)
        idx.put(interior & T(fig, band_rows(torso_rows, (70,), 1, 1)), COR1, K_SH)          # cós
        idx.put(interior & T(fig, band_rows(torso_rows, (69,), 1, 1)), COR1, K_LT)
        if v != "side":
            idx.put(part.mask & T(fig, P([(30, 76), (31, 76), (32, 76), (33, 76)])), FIXO, F_OUT)
        if v == "front":   # cordão amarrado na frente
            idx.put(part.mask & T(fig, P([(31, 70), (32, 70), (30, 71), (33, 72)])), COR2, K_BASE)
            idx.put(part.mask & T(fig, P([(31, 71), (32, 71)])), COR2, K_DK)
        elif v == "side":
            idx.put(part.mask & T(fig, P([(24, 70), (24, 71), (25, 72)])), COR2, K_BASE)
    b.torso("calca_quadril", R(grow(sel(torso_rows, 69, 76), 0, 1 if v == "side" else 0)), 0, p_pelvis)

    balloon = (84, 85, 86)

    def leg_spec(lb):
        th, sh = pants_leg_rows(fig, 86, 1, 1, 1, balloon)
        return {"thigh": R(th), "shin": R(sh)}

    def pants_extra(lb, idx, part, interior):
        idx.put(interior & Lm(fig, lb, {"shin": full_rows((86,))}), COR1, K_SH)             # o pano cai no tornozelo
        if front_like(fig):
            pts_t, pts_s = [(25, 79), (26, 80)], [(23, 84), (24, 85), (27, 85), (28, 86)]
        else:
            pts_t, pts_s = [(31, 79), (32, 80)], [(29, 84), (30, 85), (33, 85), (34, 86)]
        idx.put(interior & Lm(fig, lb, {"thigh": P(pts_t), "shin": P(pts_s)}), COR1, K_SH)   # dobras
    b.limb("leg", "calca", leg_spec, 5, cloth_limb_paint(fig, COR1, pants_extra))
    b.limb("leg", "amarracao", lambda lb: {"shin": R(sel(fig.R.leg_rows, 86, 88))}, 3, wrap_paint(fig, COR2, (88, 88)))
    b.limb("leg", "sandalia", lambda lb: sole_or_foot(fig, lb), 1, sandal_paint(fig, COR3))
    return b.done()


ITEMS = {"conjunto_vila": conjunto_ninja, "conjunto_ninja": conjunto_ninja,
         "camisa_basica": camisa_basica, "camisa_basica_lisa": lambda fig, frame: camisa_basica(fig, frame, None),
         "calca_basica": calca_basica}


def build(kind, fig, frame):
    return ITEMS[kind](fig, frame)
