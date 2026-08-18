using System.Text.Json.Serialization;
using Feriiz.Web.Services;

namespace Feriiz.Web.Models;

/// <summary>
/// Source-generated JSON metadata.
///
/// The project publishes with PublishTrimmed, and reflection-based
/// serialization is exactly what the trimmer cannot see: a Release build would
/// strip these properties and quietly deserialize an empty dataset while Debug
/// kept working. Declaring the types here makes the contract explicit and
/// removes the reflection dependency.
/// </summary>
[JsonSerializable(typeof(FeriizDataset))]
[JsonSerializable(typeof(AuthState.Session))]
internal sealed partial class FeriizJsonContext : JsonSerializerContext
{
}
