using System.Text.Json.Serialization;

namespace Feriiz.Web.Models;

/// <summary>
/// Keputusan perusahaan atas satu hari libur nasional: tetap libur, atau tetap
/// masuk kerja. Disimpan di localStorage, sama seperti halaman kalender lama.
/// </summary>
public sealed class HolidayOverride
{
    [JsonPropertyName("date")] public string Date { get; set; } = "";

    /// <summary>"holiday" atau "working".</summary>
    [JsonPropertyName("status")] public string Status { get; set; } = "holiday";

    [JsonPropertyName("note")] public string Note { get; set; } = "";
}
