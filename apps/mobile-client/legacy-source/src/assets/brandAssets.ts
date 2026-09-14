import type { ImageSourcePropType } from 'react-native';
import type { ServiceCategory } from '../types/commercial';

/**
 * Assets de marca (versões otimizadas em mobile/assets).
 * logo-mark = flor com fundo transparente (uso em UI).
 */
export const logoSource = require('../../assets/logo-mark.png');
export const heroAutocuidadoSource = require('../../assets/hero-autocuidado.jpg');

/** Ícones da ficha de anamnese (recortados de form-icons.png). */
export const formClipboardSource = require('../../assets/form-icon-clipboard.png');
export const formHeartOutlineSource = require('../../assets/form-icon-heart-outline.png');
export const formHeartFilledSource = require('../../assets/form-icon-heart-filled.png');

/** Ilustrações de planos / cobrança. */
export const medalBronzeSource = require('../../assets/ilustracoes/medalha-de-bronze.png');
export const medalSilverSource = require('../../assets/ilustracoes/medalha-de-prata.png');
export const medalGoldSource = require('../../assets/ilustracoes/medalha-de-ouro.png');
export const creditCard3dSource = require('../../assets/ilustracoes/cartao-de-credito-3d.png');

/** Ilustrações 3D das categorias de procedimentos (Home). */
export const categoryComboSource = require('../../assets/icons/pacotes.png');
export const categoryFacialSource = require('../../assets/icons/faciais.png');
export const categoryCorporalSource = require('../../assets/icons/corporais.png');
export const categoryMassagemSource = require('../../assets/icons/massagens.png');

/** Variantes masculinas (anamnese sex === 'male'). */
export const categoryComboMaleSource = require('../../assets/icons/pacotesM.png');
export const categoryFacialMaleSource = require('../../assets/icons/facialM.png');
export const categoryCorporalMaleSource = require('../../assets/icons/corporalM.png');
export const categoryMassagemMaleSource = require('../../assets/icons/massagensM.png');

export const CATEGORY_ILLUSTRATIONS: Record<ServiceCategory, ImageSourcePropType> = {
  COMBO: categoryComboSource,
  FACIAL: categoryFacialSource,
  CORPORAL: categoryCorporalSource,
  MASSAGEM: categoryMassagemSource,
};

export const CATEGORY_ILLUSTRATIONS_MALE: Record<ServiceCategory, ImageSourcePropType> = {
  COMBO: categoryComboMaleSource,
  FACIAL: categoryFacialMaleSource,
  CORPORAL: categoryCorporalMaleSource,
  MASSAGEM: categoryMassagemMaleSource,
};

/** Só `male` (Masculino na anamnese) usa ícones masculinos; demais / indefinido → default. */
export function getCategoryIllustrations(
  sex?: string | null,
): Record<ServiceCategory, ImageSourcePropType> {
  return sex === 'male' ? CATEGORY_ILLUSTRATIONS_MALE : CATEGORY_ILLUSTRATIONS;
}

/** Prefetch das imagens pesadas do onboarding antes de mostrar a UI. */
export async function preloadOnboardingAssets() {
  const { Asset } = await import('expo-asset');
  await Asset.loadAsync([logoSource, heroAutocuidadoSource]);
}
