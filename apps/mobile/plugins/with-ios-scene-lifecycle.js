const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const marker = '// KisanPool UIKit scene lifecycle';

const sceneDelegate = `
${marker}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)

    for context in connectionOptions.urlContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function withSceneLifecycle(config) {
  config = withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes(marker)) return config;

    const windowLine = /^\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
    const startReactNative = /^\s*factory\.startReactNative\(\r?\n[\s\S]*?launchOptions: launchOptions\)\r?\n/m;
    if (!windowLine.test(contents) || !startReactNative.test(contents)) {
      throw new Error('with-ios-scene-lifecycle: unexpected Expo AppDelegate template');
    }

    contents = contents
      .replace(windowLine, '    self.launchOptions = launchOptions\n')
      .replace(startReactNative, '');

    const windowProperty = '  var window: UIWindow?\n';
    if (!contents.includes(windowProperty)) {
      throw new Error('with-ios-scene-lifecycle: AppDelegate window property not found');
    }
    contents = contents.replace(
      windowProperty,
      `${windowProperty}  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`,
    );

    config.modResults.contents = `${contents}\n${sceneDelegate}`;
    return config;
  });

  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

module.exports = withSceneLifecycle;
