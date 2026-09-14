import type { ReactNode } from 'react';
import { Image, ImageBackground, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import {
  HOME_BANNER_ASPECT_RATIO,
  HOME_BANNER_BORDER_RADIUS,
} from '../constants/homeBanner';

type HomeBannerFrameProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Imagem de fundo (promo / notícia). Sempre cover no aspect 2:1. */
  imageSource?: ImageSourcePropType;
  imageUri?: string;
};

/**
 * Frame fixo 2:1 do card principal / slides do carrossel.
 * Use com gradiente OU imagem (1200×600); conteúdo fica acima do media.
 */
export function HomeBannerFrame({
  children,
  style,
  imageSource,
  imageUri,
}: HomeBannerFrameProps) {
  const media = imageUri
    ? { uri: imageUri }
    : imageSource;

  if (media) {
    return (
      <ImageBackground
        source={media}
        style={[styles.frame, style]}
        imageStyle={styles.image}
        resizeMode="cover"
      >
        {children}
      </ImageBackground>
    );
  }

  return <View style={[styles.frame, style]}>{children}</View>;
}

/** Preview / lista admin: thumbnail no mesmo aspecto. */
export function HomeBannerThumbnail({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.frame, style]}>
      <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: HOME_BANNER_ASPECT_RATIO,
    borderRadius: HOME_BANNER_BORDER_RADIUS,
    overflow: 'hidden',
  },
  image: {
    borderRadius: HOME_BANNER_BORDER_RADIUS,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
