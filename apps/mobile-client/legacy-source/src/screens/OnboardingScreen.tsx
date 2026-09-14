import { useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { brand } from '../theme/brand';
import { WelcomeStep } from './onboarding/WelcomeStep';
import { ExperienceStep } from './onboarding/ExperienceStep';
import { ClubStep } from './onboarding/ClubStep';
import { ScheduleStep } from './onboarding/ScheduleStep';

/** v3 = safe-area fullscreen. Bump força reexibir para quem já viu em testes anteriores. */
export const ONBOARDING_SEEN_KEY = 'onboarding_v3_seen';

const TOTAL = 4;

interface OnboardingScreenProps {
  onFinish: () => void;
}

export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(TOTAL - 1, i));
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    },
    []
  );

  const finish = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    } catch {
      // ignore
    }
    onFinish();
  }, [onFinish]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(i);
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) {
      setIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const steps = [
    {
      key: 'welcome',
      render: () => (
        <WelcomeStep
          total={TOTAL}
          current={index}
          onNext={() => goTo(1)}
          onSelect={goTo}
          width={width}
        />
      ),
    },
    {
      key: 'experience',
      render: () => (
        <ExperienceStep
          total={TOTAL}
          current={index}
          onNext={() => goTo(2)}
          onBack={() => goTo(0)}
          onSelect={goTo}
          width={width}
        />
      ),
    },
    {
      key: 'club',
      render: () => (
        <ClubStep
          total={TOTAL}
          current={index}
          onNext={() => goTo(3)}
          onBack={() => goTo(1)}
          onSelect={goTo}
          width={width}
        />
      ),
    },
    {
      key: 'schedule',
      render: () => (
        <ScheduleStep
          total={TOTAL}
          current={index}
          onSelect={goTo}
          onAccess={finish}
          width={width}
        />
      ),
    },
  ];

  // Fullscreen: background/orbs invadem a safe area; cada step aplica insets só no conteúdo.
  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={steps}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => item.render()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.background,
  },
  list: {
    flex: 1,
  },
});
