using Feriiz.Web;
using Feriiz.Web.Services;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
});

// One instance for the whole app: the dataset is fetched once and cached.
builder.Services.AddScoped<FeriizDataService>();
builder.Services.AddScoped<AuthState>();

await builder.Build().RunAsync();
