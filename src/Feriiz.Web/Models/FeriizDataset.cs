using System.Text.Json.Serialization;

namespace Feriiz.Web.Models;

/// <summary>Shape of feriiz-data.json. Field names match the JSON exactly.</summary>
public sealed class FeriizDataset
{
    [JsonPropertyName("meta")] public DatasetMeta? Meta { get; set; }
    [JsonPropertyName("occupations")] public List<string> Occupations { get; set; } = new();
    [JsonPropertyName("projects")] public List<Project> Projects { get; set; } = new();
    [JsonPropertyName("employees")] public List<Employee> Employees { get; set; } = new();
    [JsonPropertyName("attendance")] public List<AttendanceEntry> Attendance { get; set; } = new();
    [JsonPropertyName("requests")] public List<LeaveRequest> Requests { get; set; } = new();
    [JsonPropertyName("holidays")] public List<Holiday> Holidays { get; set; } = new();
}

public sealed class DatasetMeta
{
    [JsonPropertyName("generatedAt")] public string? GeneratedAt { get; set; }
    [JsonPropertyName("version")] public string? Version { get; set; }
    [JsonPropertyName("timezone")] public string? Timezone { get; set; }
    [JsonPropertyName("periodStart")] public string? PeriodStart { get; set; }
    [JsonPropertyName("periodEnd")] public string? PeriodEnd { get; set; }
    [JsonPropertyName("currency")] public string? Currency { get; set; }
}

public sealed class Project
{
    [JsonPropertyName("code")] public string Code { get; set; } = "";
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "Attendance";
    [JsonPropertyName("location")] public string? Location { get; set; }
    [JsonPropertyName("address")] public string? Address { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "Active";
    [JsonPropertyName("client")] public string? Client { get; set; }
    [JsonPropertyName("startedAt")] public DateTimeOffset? StartedAt { get; set; }
    [JsonPropertyName("createdAt")] public DateTimeOffset? CreatedAt { get; set; }
    [JsonPropertyName("updatedAt")] public DateTimeOffset? UpdatedAt { get; set; }
    [JsonPropertyName("lastActivityAt")] public DateTimeOffset? LastActivityAt { get; set; }
    [JsonPropertyName("employeeCount")] public int EmployeeCount { get; set; }
    [JsonPropertyName("workingDays")] public List<string> WorkingDays { get; set; } = new();
    [JsonPropertyName("workStart")] public string WorkStart { get; set; } = "08:00";
    [JsonPropertyName("workEnd")] public string WorkEnd { get; set; } = "17:00";
    [JsonPropertyName("overtimeRate")] public decimal OvertimeRate { get; set; }
    [JsonPropertyName("clientOvertimeRate")] public decimal ClientOvertimeRate { get; set; }
}

public sealed class Employee
{
    [JsonPropertyName("code")] public string Code { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("occupation")] public string Occupation { get; set; } = "-";
    [JsonPropertyName("pin")] public string Pin { get; set; } = "";
    [JsonPropertyName("photo")] public string? Photo { get; set; }
    /// <summary>Full filename, used by the original Anomali team photos.</summary>
    [JsonPropertyName("photoFile")] public string? PhotoFile { get; set; }
    [JsonPropertyName("phone")] public string? Phone { get; set; }
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("joinedAt")] public DateOnly? JoinedAt { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "Active";
    [JsonPropertyName("dailyRate")] public decimal DailyRate { get; set; }
    [JsonPropertyName("clientDailyRate")] public decimal ClientDailyRate { get; set; }
    [JsonPropertyName("projects")] public List<string> Projects { get; set; } = new();
}

public sealed class AttendanceEntry
{
    [JsonPropertyName("employeeCode")] public string EmployeeCode { get; set; } = "";
    [JsonPropertyName("projectCode")] public string ProjectCode { get; set; } = "";
    [JsonPropertyName("date")] public string Date { get; set; } = "";
    [JsonPropertyName("inTime")] public string InTime { get; set; } = "";
    [JsonPropertyName("outTime")] public string OutTime { get; set; } = "";
    [JsonPropertyName("workHours")] public double WorkHours { get; set; }
    [JsonPropertyName("overtimeHours")] public double OvertimeHours { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "";

    public bool IsMissingCheckIn => string.IsNullOrEmpty(InTime) && !string.IsNullOrEmpty(OutTime);
    public bool IsMissingCheckOut => !string.IsNullOrEmpty(InTime) && string.IsNullOrEmpty(OutTime);
    public bool IsOffDay => Status is "weekend" or "holiday";
}

public sealed class LeaveRequest
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("employeeCode")] public string EmployeeCode { get; set; } = "";
    [JsonPropertyName("projectCode")] public string ProjectCode { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    [JsonPropertyName("dateStart")] public string DateStart { get; set; } = "";
    [JsonPropertyName("dateEnd")] public string DateEnd { get; set; } = "";
    [JsonPropertyName("reason")] public string? Reason { get; set; }
    [JsonPropertyName("pic")] public string? Pic { get; set; }
    [JsonPropertyName("status")] public string Status { get; set; } = "Pending";
    [JsonPropertyName("submittedAt")] public DateTimeOffset? SubmittedAt { get; set; }
    [JsonPropertyName("decidedAt")] public DateTimeOffset? DecidedAt { get; set; }
    [JsonPropertyName("remark")] public string? Remark { get; set; }

    /// <summary>Maps a request type onto the calendar colour buckets.</summary>
    public string Category => Type.Contains("Sick", StringComparison.OrdinalIgnoreCase) ? "sick"
        : Type.Contains("Remote", StringComparison.OrdinalIgnoreCase) ? "work"
        : Type.Contains("Leave", StringComparison.OrdinalIgnoreCase)
          || Type.Contains("Permission", StringComparison.OrdinalIgnoreCase) ? "leave"
        : "other";
}

public sealed class Holiday
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("date")] public string Date { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "national";
}
