export function requestGoogleAccessToken(): Promise<string> {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
        | string
        | undefined;
    if (!clientId) {
        return Promise.reject(
            new Error('VITE_GOOGLE_CLIENT_ID is not configured'),
        );
    }
    return new Promise((resolve, reject) => {
        const popup = window.open(
            `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=token&scope=${encodeURIComponent('openid email profile')}&prompt=select_account`,
            'google-oauth',
            'width=500,height=650',
        );
        if (!popup) {
            reject(new Error('Google popup was blocked'));
            return;
        }
        const timer = window.setInterval(() => {
            try {
                if (popup.closed) {
                    window.clearInterval(timer);
                    reject(new Error('Google login was cancelled'));
                    return;
                }
                if (popup.location.origin !== window.location.origin) return;
                const token = new URLSearchParams(
                    popup.location.hash.slice(1),
                ).get('access_token');
                if (!token) return;
                window.clearInterval(timer);
                popup.close();
                resolve(token);
            } catch {
                /* Cross-origin popup until redirect is expected. */
            }
        }, 200);
    });
}
