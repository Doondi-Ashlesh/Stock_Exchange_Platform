import { NativeBaseProvider } from 'native-base';
import { StatusBar } from 'expo-status-bar';
import { PremiumApp } from './components/PremiumApp';
import { styles } from './utils/styles';

import * as serviceWorkerRegistration from "./src/serviceWorkerRegistration";

export default function App() {
	return (
		<NativeBaseProvider theme={styles}>
			<StatusBar style="light" />
			<PremiumApp />
		</NativeBaseProvider>
	);
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();
