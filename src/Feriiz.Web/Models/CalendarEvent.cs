namespace Feriiz.Web.Models;

/// <summary>
/// Satu pengajuan yang tampil di kalender, sudah diratakan dari LeaveRequest +
/// nama karyawannya. Dipakai halaman Calendar dan Project Calendar.
/// </summary>
public sealed record CalendarEvent(
    string Name,
    string Type,
    /// <summary>work / leave / sick / other - menentukan warnanya.</summary>
    string Cat,
    string Project,
    string DateStart,
    string DateEnd,
    string Status,
    string Pic);
