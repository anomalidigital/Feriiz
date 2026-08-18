using System.Text.Json;
using Feriiz.Web.Models;
using Microsoft.JSInterop;

namespace Feriiz.Web.Services;

/// <summary>
/// Demo auth, ported from the guard at the top of assets/js/app.js.
/// The session lives in localStorage under "feriiz_user"; the password is
/// still the hard-coded demo one until a real backend is wired up.
/// </summary>
public sealed class AuthState
{
    private const string StorageKey = "feriiz_user";
    private const string DemoPassword = "demo123";

    private readonly IJSRuntime _js;

    public AuthState(IJSRuntime js) => _js = js;

    public sealed record Session(string Email, string Name, long LoginAt);

    public async Task<Session?> GetSessionAsync()
    {
        var raw = await _js.InvokeAsync<string?>("localStorage.getItem", StorageKey);
        if (string.IsNullOrWhiteSpace(raw)) return null;
        try { return JsonSerializer.Deserialize(raw, FeriizJsonContext.Default.Session); }
        catch { return null; }
    }

    public async Task<bool> IsAuthenticatedAsync() => await GetSessionAsync() is not null;

    /// <summary>Returns false when the password does not match the demo one.</summary>
    public async Task<bool> SignInAsync(string email, string password)
    {
        if (password != DemoPassword) return false;
        var session = new Session(email, "Admin", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await _js.InvokeVoidAsync("localStorage.setItem", StorageKey,
            JsonSerializer.Serialize(session, FeriizJsonContext.Default.Session));
        return true;
    }

    public async Task SignOutAsync() =>
        await _js.InvokeVoidAsync("localStorage.removeItem", StorageKey);
}
