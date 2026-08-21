const fs = require('fs');

const path = './Khedutbazar/Info.plist';
let content = fs.readFileSync(path, 'utf8');

const dictEnd = '</dict>\n</plist>';
const privacyStrings = `
	<key>NSCameraUsageDescription</key>
	<string>We need access to your camera so you can take photos to upload for your ads.</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>We need access to your photo library so you can choose photos to upload for your ads.</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>We need access to your microphone for video recording.</string>
`;

if (!content.includes('NSCameraUsageDescription')) {
    content = content.replace(dictEnd, privacyStrings + dictEnd);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Updated Info.plist');
} else {
    console.log('Info.plist already updated');
}
