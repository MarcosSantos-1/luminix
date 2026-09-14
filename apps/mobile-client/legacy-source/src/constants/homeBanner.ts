/**
 * Spec do card principal / futuro carrossel da home (plan / promo / notícia).
 *
 * Use estes valores ao gerar imagens (IA ou upload admin) e ao renderizar
 * slides com Image / ImageBackground + resizeMode="cover".
 */

/** Largura do asset master (px). */
export const HOME_BANNER_WIDTH = 1200;

/** Altura do asset master (px). */
export const HOME_BANNER_HEIGHT = 600;

/** Aspecto lógico no app (largura / altura). */
export const HOME_BANNER_ASPECT_RATIO = HOME_BANNER_WIDTH / HOME_BANNER_HEIGHT; // 2

/** Border radius do card na home (dp). */
export const HOME_BANNER_BORDER_RADIUS = 20;

/**
 * Safe zone no master 1200×600: manter sujeito/texto importante
 * ~40–48 px para dentro das bordas (canto arredondado + padding visual).
 */
export const HOME_BANNER_SAFE_INSET_PX = 40;

/** Prompt hint para APIs de geração de imagem. */
export const HOME_BANNER_AI_SIZE_HINT = `${HOME_BANNER_WIDTH}x${HOME_BANNER_HEIGHT}`;

export const HOME_BANNER_AI_ASPECT = '2:1' as const;
