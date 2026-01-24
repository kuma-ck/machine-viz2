/**
 * Common Utilities
 */

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'info', 'success', 'error', 'warning'
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon based on type
    let icon = '';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '!';
    if (type === 'warning') icon = '⚠';
    if (type === 'info') icon = 'ℹ';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto dismiss
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

/**
 * Theme Toggle Logic
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Check local storage
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    // 2. Set button icon state
    updateThemeIcon(currentTheme);

    // 3. Bind click event
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const target = current === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', target);
            localStorage.setItem('theme', target);
            updateThemeIcon(target);
        });
    }
});

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    // Lucide replaces the <i> tag with an <svg> tag.
    // We should just reset the innerHTML to a new <i> tag and re-run createIcons.
    if (theme === 'dark') {
        btn.innerHTML = '<i data-lucide="sun" style="width: 16px; height: 16px;"></i>';
    } else {
        btn.innerHTML = '<i data-lucide="moon" style="width: 16px; height: 16px;"></i>';
    }
    lucide.createIcons();
}
