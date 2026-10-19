/**
 * Todo o SQL que os handlers executam. Tudo qualificado com "game." para não
 * depender do search_path da conexão. Parâmetros sempre posicionais ($n).
 */
export const SQL = {
  /** assertMissionTrainee: trainee_id é imutável (trigger), então ler antes é seguro. */
  missionTrainee: `
    SELECT trainee_id
      FROM game.sensei_missions
     WHERE id = $1`,

  /**
   * redeem: de pergaminho para missão E aprendiz, numa ida só ao banco
   * (substitui scrollMission + assertMissionTrainee). trainee_id é imutável.
   */
  scrollTrainee: `
    SELECT sm.trainee_id, sm.id AS mission_id
      FROM game.completion_scrolls  s
      JOIN game.mission_evaluations e  ON e.id  = s.evaluation_id
      JOIN game.sensei_missions     sm ON sm.id = e.mission_id
     WHERE s.id = $1`,

  /**
   * 1. POST /missions. $1 = JWT.sub (sensei). Tipo e dificuldade chegam por código;
   * código inexistente vira NULL e o trigger recusa com rule_catalog_active.
   * XP e título não são enviados: o trigger copia da dificuldade.
   */
  createMission: `
    INSERT INTO game.sensei_missions
      (sensei_id, trainee_id, mission_type_id, difficulty_id, target_code, target_quantity, expires_at)
    VALUES (
      $1, $2,
      (SELECT id FROM game.mission_types        WHERE code = $3),
      (SELECT id FROM game.mission_difficulties WHERE code = $4),
      $5, $6,
      CASE WHEN $7::int IS NULL THEN NULL ELSE now() + make_interval(mins => $7::int) END
    )
    RETURNING id, sensei_id, trainee_id, target_code, target_quantity, progress_quantity,
              xp_reward, reward_title_id, status, created_at, expires_at`,

  /**
   * TODO (idempotência, fase do game loop): hoje LEAST(progress + amount, target) aceita
   * "coletar o 21º de 20" sem erro, MAS conta duas vezes se o servidor reenviar o mesmo
   * evento (retry, lag, bug de contagem). Na fase do game loop, migrar para uma tabela
   * progress_events(event_id UUID UNIQUE, mission_id, amount, created_at) com
   * INSERT ... ON CONFLICT DO NOTHING, e o addProgress passa a receber event_id
   * obrigatório. Não implementar agora.
   *
   * 2. PATCH /internal/missions/:id/progress. Soma e limita ao alvo
   * (passar do alvo, ex.: o 21º recurso de 20, não é erro do aprendiz).
   * Missão fora de 'active' é recusada pelo trigger (rule_mission_progress).
   */
  addProgress: `
    UPDATE game.sensei_missions
       SET progress_quantity = LEAST(progress_quantity + $2, target_quantity)
     WHERE id = $1
    RETURNING id, status, progress_quantity, target_quantity`,

  /**
   * 3. POST /missions/:id/submit (depois de assertMissionTrainee).
   * A guarda de status faz a query nem tocar a linha fora de 'active' (ex.: duplo clique).
   * Objetivo incompleto e prazo vencido continuam barrados pelo trigger.
   */
  submitMission: `
    UPDATE game.sensei_missions
       SET status = 'submitted'
     WHERE id = $1
       AND status = 'active'
    RETURNING id, status, progress_quantity, target_quantity, submitted_at`,

  /** 4. POST /missions/:id/evaluate. $2 = JWT.sub (avaliador). */
  insertEvaluation: `
    INSERT INTO game.mission_evaluations (mission_id, evaluated_by, is_approved, score, feedback)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, mission_id, evaluated_by, is_approved, score, feedback, evaluated_at`,

  /** 4. Pergaminho emitido pelo trigger na mesma transação (só existe se aprovada). */
  scrollOfEvaluation: `
    SELECT id, issued_at
      FROM game.completion_scrolls
     WHERE evaluation_id = $1`,

  /** 5. POST /scrolls/:id/redeem (depois de assertMissionTrainee). */
  insertRedemption: `
    INSERT INTO game.scroll_redemptions (scroll_id)
    VALUES ($1)
    RETURNING id, redeemed_at`,

  /** 5. O que o resgate creditou (lido na mesma transação, depois do trigger). */
  redemptionReward: `
    SELECT m.xp_reward AS xp_awarded,
           p.total_xp,
           t.code      AS title_code,
           t.name      AS title_name
      FROM game.sensei_missions m
      JOIN game.players p        ON p.id = m.trainee_id
      LEFT JOIN game.player_titles pt ON pt.redemption_id = $2
      LEFT JOIN game.titles t    ON t.id = pt.title_id
     WHERE m.id = $1`,
} as const;
