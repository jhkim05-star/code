# Android financial notification adapter contract

향후 Capacitor native shell은 JS에 다음 형태만 노출합니다.

```ts
interface FinancialNotificationAdapter {
  listFinancialNotifications(input: { sinceCursor?: string | null }): Promise<{
    items: Array<{ id: string; text: string; receivedAt?: string }>;
    cursor: string | null;
  }>;
}
```

권장 Android 흐름:

1. 사용자가 앱에서 기능을 켜고 Android 시스템의 알림 접근 설정으로 이동합니다.
2. `NotificationListenerService`는 사용자가 권한을 유지하는 동안 허용된 카드사 앱·카카오 알림톡 후보만 앱 전용 암호화 local inbox에 기록합니다.
3. 원본 텍스트는 파싱 직후 지우고, 앱에는 정규화된 거래 후보만 넘깁니다.
4. `sinceCursor`보다 새로운 항목만 반환합니다. cursor는 단조 증가하며 재설치 전에는 역행하지 않습니다.
5. JS parser registry가 카드사별 후보를 해석합니다. 카드 aliases가 하나로 결정되지 않으면 사용자 선택을 요구합니다.
6. 권한 철회·서비스 중지·OEM 절전 제한을 명시적인 상태로 반환하고 조용히 성공 처리하지 않습니다.

민감한 전체 알림 로그, 카카오톡 계정 쿠키·세션, 비공식 로그인 정보는 수집하거나 전송하지 않습니다. 네트워크 업로드는 이 adapter의 책임이 아닙니다.
