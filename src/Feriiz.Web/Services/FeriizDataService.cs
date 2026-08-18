using System.Net.Http.Json;
using Feriiz.Web.Models;

namespace Feriiz.Web.Services;

/// <summary>
/// Replaces assets/js/data.js. Fetches feriiz-data.json once and hands typed
/// data to the pages.
///
/// Requests and Calendar keep using the curated Anomali team (12 named people)
/// rather than the generated set, exactly as the JS version did.
/// </summary>
public sealed class FeriizDataService
{
    private const string DataUrl = "feriiz-data.json";

    private readonly HttpClient _http;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private FeriizDataset? _data;
    private Dictionary<string, Employee> _byCode = new(StringComparer.Ordinal);
    private Dictionary<string, Project> _byProject = new(StringComparer.Ordinal);

    public FeriizDataService(HttpClient http) => _http = http;

    public FeriizDataset Data => _data ?? new FeriizDataset();
    public IReadOnlyList<string> Occupations => Data.Occupations;
    public IReadOnlyList<Project> Projects => Data.Projects;
    public IReadOnlyList<Employee> Employees => Data.Employees;
    public IReadOnlyList<AttendanceEntry> Attendance => Data.Attendance;

    /// <summary>Curated demo set — Requests and Calendar use these, not the generated ones.</summary>
    public IReadOnlyList<LeaveRequest> Requests => AnomaliDemo.Requests;
    public IReadOnlyList<Holiday> Holidays => AnomaliDemo.Holidays;

    /// <summary>Loads the dataset on first call; later calls return immediately.</summary>
    public async Task EnsureLoadedAsync()
    {
        if (_data is not null) return;

        await _gate.WaitAsync();
        try
        {
            if (_data is not null) return;

            _data = await _http.GetFromJsonAsync(DataUrl, FeriizJsonContext.Default.FeriizDataset)
                    ?? new FeriizDataset();

            _byCode = _data.Employees
                .GroupBy(e => e.Code, StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);
            _byProject = _data.Projects
                .GroupBy(p => p.Code, StringComparer.Ordinal)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.Ordinal);

            // Register the Anomali team so Requests/Calendar can resolve their
            // names and photos by code.
            foreach (var e in AnomaliDemo.Employees)
                _byCode.TryAdd(e.Code, e);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[FeriizDataService] failed to load {DataUrl}: {ex.Message}");
            _data ??= new FeriizDataset();
            foreach (var e in AnomaliDemo.Employees)
                _byCode.TryAdd(e.Code, e);
        }
        finally
        {
            _gate.Release();
        }
    }

    public Employee? FindEmployee(string? code) =>
        code is not null && _byCode.TryGetValue(code, out var e) ? e : null;

    public Project? FindProject(string? code) =>
        code is not null && _byProject.TryGetValue(code, out var p) ? p : null;

    /// <summary>First project in the dataset — used when no ?project= is supplied.</summary>
    public Project? DefaultProject => Projects.FirstOrDefault();

    public IEnumerable<Employee> EmployeesOfProject(string projectCode) =>
        Employees.Where(e => e.Projects.Contains(projectCode, StringComparer.Ordinal));

    /// <summary>Photo URL, falling back to a generated initials avatar.</summary>
    public string AvatarSrc(Employee? employee)
    {
        if (employee is null) return InitialsAvatar("");
        if (!string.IsNullOrEmpty(employee.PhotoFile))
            return $"assets/images/employees/{Uri.EscapeDataString(employee.PhotoFile)}";
        if (!string.IsNullOrEmpty(employee.Photo))
            return $"assets/images/employees/{employee.Photo}.jpg";
        return InitialsAvatar(employee.Name);
    }

    /// <summary>Inline SVG avatar; colour is derived from the name so it is stable per person.</summary>
    public static string InitialsAvatar(string? name)
    {
        var text = string.IsNullOrWhiteSpace(name) ? "?" : name.Trim();
        var parts = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var initials = string.Concat(
            parts.Length > 0 ? parts[0][..1] : "?",
            parts.Length > 1 ? parts[1][..1] : ""
        ).ToUpperInvariant();

        var hash = 0;
        foreach (var c in text) hash = unchecked(hash * 31 + c);
        var hue = (hash & 0x7FFFFFFF) % 360;

        var svg =
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>" +
            $"<rect width='48' height='48' fill='hsl({hue}, 55%, 50%)'/>" +
            "<text x='24' y='30' font-family='Poppins,sans-serif' font-size='18' font-weight='700' " +
            $"fill='#fff' text-anchor='middle'>{initials}</text></svg>";

        return "data:image/svg+xml;utf8," + Uri.EscapeDataString(svg);
    }

    /// <summary>Formats a rupiah amount the way the report tables expect.</summary>
    public static string Idr(decimal amount) =>
        amount == 0 ? "IDR0" : "IDR" + amount.ToString("#,##0").Replace(',', '.');
}
