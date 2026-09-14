const { withAppBuildGradle } = require('expo/config-plugins');

const CMAKE_BLOCK = `
        // Windows: CMake/Ninja embed absolute source paths into .o filenames and hit MAX_PATH (260).
        // Hash long object paths so New Architecture native builds succeed.
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_OBJECT_PATH_MAX=1024"
            }
        }`;

/**
 * Avoids Windows MAX_PATH failures in New Architecture CMake/Ninja builds.
 * See: https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows
 */
function withWindowsCmakeObjectPathMax(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    let contents = config.modResults.contents;
    if (contents.includes('CMAKE_OBJECT_PATH_MAX')) {
      return config;
    }

    const anchor =
      /buildConfigField\s+"String",\s+"REACT_NATIVE_RELEASE_LEVEL",[^\n]+\n/;
    if (!anchor.test(contents)) {
      throw new Error(
        'withWindowsCmakeObjectPathMax: could not find REACT_NATIVE_RELEASE_LEVEL anchor in app/build.gradle'
      );
    }

    contents = contents.replace(anchor, (match) => `${match}${CMAKE_BLOCK}\n`);
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withWindowsCmakeObjectPathMax;
