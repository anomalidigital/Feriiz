namespace Feriiz.Web.Services;

/// <summary>
/// Minimal query-string reader. System.Web.HttpUtility is not available in
/// Blazor WebAssembly, and this is all the pages need (?project=CODE,
/// ?employee=CODE), so it avoids pulling in another package.
/// </summary>
public static class QueryString
{
    /// <summary>Returns the value of <paramref name="key"/> in the URI's query, or null.</summary>
    public static string? Get(string uri, string key)
    {
        var q = uri.IndexOf('?');
        if (q < 0 || q == uri.Length - 1) return null;

        var query = uri[(q + 1)..];
        var hash = query.IndexOf('#');
        if (hash >= 0) query = query[..hash];

        foreach (var pair in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = pair.IndexOf('=');
            var name = eq < 0 ? pair : pair[..eq];
            if (!string.Equals(Uri.UnescapeDataString(name), key, StringComparison.OrdinalIgnoreCase))
                continue;
            return eq < 0 ? "" : Uri.UnescapeDataString(pair[(eq + 1)..].Replace('+', ' '));
        }
        return null;
    }
}
