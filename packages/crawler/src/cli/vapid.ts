/** 웹 푸시용 VAPID 키 쌍을 만든다. 한 번 만들어 환경변수에 넣고 계속 쓴다. */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
console.log('아래를 환경변수에 넣으세요. (public 키는 브라우저에도 노출됩니다)\n')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`VAPID_SUBJECT=mailto:여러분의@메일주소`)
console.log('\n⚠ private 키는 절대 저장소에 커밋하지 마세요. 유출되면 남이 우리 이름으로 푸시를 보냅니다.')
