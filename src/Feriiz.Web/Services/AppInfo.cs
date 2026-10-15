namespace Feriiz.Web.Services;

/// <summary>
/// One place for the version string the pages print in their footer, so the
/// login card and the account page cannot drift apart.
/// </summary>
public static class AppInfo
{
    /// <summary>4.x is the Blazor rewrite; the static HTML site stopped at 3.5.7.</summary>
    public const string Version = "4.0.0";
}
