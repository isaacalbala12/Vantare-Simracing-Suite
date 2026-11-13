// VANTA-141: compile on the server; execute ONLY on Isaac's gaming PC.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <d3dcompiler.h>
#include <dxgi.h>
#include <wrl/client.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "provenance.h"

using Microsoft::WRL::ComPtr;
extern "C" __declspec(dllexport) const char* vantare_measurement_provenance() {
    return kProvenance;
}
static void check(HRESULT result, const char* operation) {
    if (FAILED(result)) throw std::runtime_error(std::string(operation) + ": " + std::to_string(result));
}
static uint64_t qpc() { LARGE_INTEGER value; QueryPerformanceCounter(&value); return value.QuadPart; }
static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM w, LPARAM l) {
    if (message == WM_CLOSE || (message == WM_KEYDOWN && w == VK_ESCAPE)) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(window, message, w, l);
}
static constexpr char shader[] = R"hlsl(
cbuffer Parameters : register(b0) { float2 resolution; uint iterations; float pad; };
float4 vertex(uint id : SV_VertexID) : SV_Position {
    float2 p = float2((id << 1) & 2, id & 2);
    return float4(p * float2(2,-2) + float2(-1,1),0,1);
}
float4 pixel(float4 position : SV_Position) : SV_Target {
    float2 p = (position.xy / resolution - 0.5) * 3.0;
    float3 sum = float3(0.13,0.21,0.37);
    [loop] for (uint i = 0; i < iterations; i++) {
        float k = float(i) * 0.013 + 0.2;
        p = sin(p.yx * 1.23 + float2(k, -k)) + p * 0.17;
        sum += float3(sin(p.x+k),cos(p.y-k),sin(p.x*p.y+k)) / (float(i)+1);
    }
    return float4(saturate(sum * 0.17 + 0.3),1);
}
)hlsl";
struct Parameters { float width, height; uint32_t iterations; float pad; };
struct Timing {
    ComPtr<ID3D11Query> disjoint, start, end;
    bool pending = false;
    uint64_t frame = 0;
};
struct Sample { uint64_t frame, begin_qpc, present_qpc; uint32_t iterations; double gpu_ms; bool measured; };
struct CloseHandleGuard { HANDLE value; ~CloseHandleGuard() { if(value != INVALID_HANDLE_VALUE) CloseHandle(value); } };
struct DestroyWindowGuard { HWND value; ~DestroyWindowGuard() { if(value) DestroyWindow(value); } };

int wmain(int argc, wchar_t** argv) {
    try {
        int hz = 60, seconds = 70;
        std::wstring output, ready_path;
        uint32_t fixed_iterations=0; bool controlled=false;
        for (int i=1;i<argc;i++) {
            std::wstring key(argv[i]);
            if (key == L"--control-stdin") { controlled=true; continue; }
            if (i+1 >= argc) throw std::runtime_error("Falta valor de opcion");
            std::wstring value(argv[++i]);
            if (key == L"--hz") hz = std::stoi(value);
            else if (key == L"--seconds") seconds = std::stoi(value);
            else if (key == L"--output") output = value;
            else if (key == L"--ready") ready_path = value;
            else if (key == L"--iterations") {
                fixed_iterations=std::stoul(value);
                if(fixed_iterations<1 || fixed_iterations>4096) throw std::runtime_error("iterations fuera de 1..4096");
            }
            else throw std::runtime_error("Opcion desconocida");
        }
        if ((hz != 60 && hz != 144) || seconds < 20 || seconds > 180 || output.empty())
            throw std::runtime_error("Uso: --hz 60|144 --seconds 20..180 --output archivo-nuevo.csv");
        const HANDLE parent_input=GetStdHandle(STD_INPUT_HANDLE);
        if(controlled && GetFileType(parent_input)!=FILE_TYPE_PIPE)
            throw std::runtime_error("--control-stdin requiere pipe del controlador");
        DEVMODEW mode {}; mode.dmSize=sizeof(mode);
        if(!EnumDisplaySettingsW(nullptr,ENUM_CURRENT_SETTINGS,&mode) || int(mode.dmDisplayFrequency)!=hz)
            throw std::runtime_error("La frecuencia del monitor principal no coincide con --hz");
        CloseHandleGuard file {CreateFileW(output.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr)};
        if(file.value == INVALID_HANDLE_VALUE) throw std::runtime_error("No se puede crear archivo nuevo de carga");
        LARGE_INTEGER frequency; QueryPerformanceFrequency(&frequency);
        WNDCLASSW wc {}; wc.lpfnWndProc=window_proc; wc.hInstance=GetModuleHandleW(nullptr); wc.lpszClassName=L"Vantare141GpuLoad";
        if(!RegisterClassW(&wc)) throw std::runtime_error("No se puede registrar ventana");
        POINT origin {}; MONITORINFO monitor {sizeof(MONITORINFO)};
        if(!GetMonitorInfoW(MonitorFromPoint(origin,MONITOR_DEFAULTTOPRIMARY),&monitor)) throw std::runtime_error("No se puede consultar monitor");
        const auto rect=monitor.rcMonitor;
        const int width=rect.right-rect.left, height=rect.bottom-rect.top;
        DestroyWindowGuard window {CreateWindowExW(0,wc.lpszClassName,L"Vantare - carga GPU de medicion",WS_POPUP|WS_VISIBLE,
            rect.left,rect.top,width,height,nullptr,nullptr,wc.hInstance,nullptr)};
        if(!window.value) throw std::runtime_error("No se puede crear ventana");
        DXGI_SWAP_CHAIN_DESC description {};
        description.BufferDesc.Width=width; description.BufferDesc.Height=height; description.BufferDesc.Format=DXGI_FORMAT_R8G8B8A8_UNORM;
        description.SampleDesc.Count=1; description.BufferUsage=DXGI_USAGE_RENDER_TARGET_OUTPUT; description.BufferCount=2;
        description.OutputWindow=window.value; description.Windowed=TRUE; description.SwapEffect=DXGI_SWAP_EFFECT_FLIP_DISCARD;
        ComPtr<ID3D11Device> device; ComPtr<ID3D11DeviceContext> context; ComPtr<IDXGISwapChain> swap;
        // Hardware only. Never silently use WARP or a software reference device.
        check(D3D11CreateDeviceAndSwapChain(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,0,nullptr,0,D3D11_SDK_VERSION,
            &description,&swap,&device,nullptr,&context),"D3D11 hardware");
        ComPtr<ID3D11Texture2D> buffer; ComPtr<ID3D11RenderTargetView> target;
        check(swap->GetBuffer(0,IID_PPV_ARGS(&buffer)),"back buffer");
        check(device->CreateRenderTargetView(buffer.Get(),nullptr,&target),"render target");
        ComPtr<ID3DBlob> vertex_bytes,pixel_bytes,errors;
        check(D3DCompile(shader,sizeof(shader)-1,"carga",nullptr,nullptr,"vertex","vs_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&vertex_bytes,&errors),"vertex shader");
        check(D3DCompile(shader,sizeof(shader)-1,"carga",nullptr,nullptr,"pixel","ps_5_0",D3DCOMPILE_OPTIMIZATION_LEVEL3,0,&pixel_bytes,&errors),"pixel shader");
        ComPtr<ID3D11VertexShader> vertex; ComPtr<ID3D11PixelShader> pixel;
        check(device->CreateVertexShader(vertex_bytes->GetBufferPointer(),vertex_bytes->GetBufferSize(),nullptr,&vertex),"vertex");
        check(device->CreatePixelShader(pixel_bytes->GetBufferPointer(),pixel_bytes->GetBufferSize(),nullptr,&pixel),"pixel");
        D3D11_BUFFER_DESC cb {}; cb.ByteWidth=sizeof(Parameters); cb.Usage=D3D11_USAGE_DEFAULT; cb.BindFlags=D3D11_BIND_CONSTANT_BUFFER;
        ComPtr<ID3D11Buffer> constants; check(device->CreateBuffer(&cb,nullptr,&constants),"constants");
        D3D11_VIEWPORT viewport {0,0,float(width),float(height),0,1}; context->RSSetViewports(1,&viewport);
        ID3D11RenderTargetView* targets[]={target.Get()}; context->OMSetRenderTargets(1,targets,nullptr);
        context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
        context->VSSetShader(vertex.Get(),nullptr,0); context->PSSetShader(pixel.Get(),nullptr,0);
        ID3D11Buffer* buffers[]={constants.Get()}; context->PSSetConstantBuffers(0,1,buffers);
        std::array<Timing,8> timings;
        for(auto& timing:timings) {
            D3D11_QUERY_DESC d {D3D11_QUERY_TIMESTAMP_DISJOINT,0}; check(device->CreateQuery(&d,&timing.disjoint),"disjoint query");
            d.Query=D3D11_QUERY_TIMESTAMP; check(device->CreateQuery(&d,&timing.start),"start query"); check(device->CreateQuery(&d,&timing.end),"end query");
        }
        const uint64_t began=qpc(); const double target_ms=700.0/hz;
        uint32_t iterations=fixed_iterations ? fixed_iterations : 32;
        bool cancelled=false, parent_stopped=false, notified=false, calibration_rejected=false;
        std::vector<Sample> samples; samples.reserve(size_t(seconds)*hz+100);
        std::vector<double> calibrated; uint64_t frame=0;
        auto calibrated_median=[&]() {
            if(calibrated.empty()) return 0.0;
            auto copy=calibrated; std::sort(copy.begin(),copy.end()); return copy[copy.size()/2];
        };
        while(double(qpc()-began)/frequency.QuadPart < seconds) {
            if(controlled && !PeekNamedPipe(parent_input,nullptr,0,nullptr,nullptr,nullptr)) {
                if(GetLastError()!=ERROR_BROKEN_PIPE) throw std::runtime_error("Fallo del pipe de control");
                parent_stopped=true; break;
            }
            MSG message; while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)) {
                if(message.message==WM_QUIT) cancelled=true;
                TranslateMessage(&message); DispatchMessageW(&message);
            }
            if(cancelled) break;
            const double elapsed=double(qpc()-began)/frequency.QuadPart;
            if(!ready_path.empty() && !notified && elapsed>=14) {
                const double value=calibrated_median();
                const bool calibrated_ok=value>=target_ms*0.8 && value<=target_ms*1.2;
                CloseHandleGuard ready_file {CreateFileW(ready_path.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr)};
                if(ready_file.value==INVALID_HANDLE_VALUE) throw std::runtime_error("No se puede crear marca nueva de carga");
                std::ostringstream mark; mark << "{\"ready\":" << (calibrated_ok ? "true" : "false")
                    << ",\"iterations\":" << iterations << ",\"hz\":" << hz << ",\"qpc\":" << qpc() << "}";
                const auto bytes=mark.str(); DWORD count=0;
                if(!WriteFile(ready_file.value,bytes.data(),DWORD(bytes.size()),&count,nullptr) || count!=bytes.size())
                    throw std::runtime_error("Fallo al guardar marca de carga");
                notified=true;
                if(!calibrated_ok) { calibration_rejected=true; break; }
            }
            auto& timing=timings[frame%timings.size()];
            if(timing.pending) {
                D3D11_QUERY_DATA_TIMESTAMP_DISJOINT disjoint {}; uint64_t start=0,end=0;
                HRESULT ready=context->GetData(timing.disjoint.Get(),&disjoint,sizeof(disjoint),D3D11_ASYNC_GETDATA_DONOTFLUSH);
                check(ready,"query result");
                if(ready==S_OK && context->GetData(timing.start.Get(),&start,sizeof(start),D3D11_ASYNC_GETDATA_DONOTFLUSH)==S_OK &&
                   context->GetData(timing.end.Get(),&end,sizeof(end),D3D11_ASYNC_GETDATA_DONOTFLUSH)==S_OK) {
                    timing.pending=false;
                    if(!disjoint.Disjoint && disjoint.Frequency && end>=start) {
                        double ms=1000.0*double(end-start)/disjoint.Frequency;
                        samples[timing.frame].gpu_ms=ms; samples[timing.frame].measured=true;
                        if(!fixed_iterations && elapsed<10 && ms>0) {
                            const double estimate=double(samples[timing.frame].iterations)*std::clamp(target_ms/ms,0.5,2.0);
                            iterations=uint32_t(std::clamp(0.8*iterations+0.2*estimate,1.0,4096.0));
                        }
                        if(elapsed>=12 && elapsed<14) calibrated.push_back(ms);
                    }
                }
            }
            const bool query=!timing.pending;
            const auto begin=qpc();
            if(query) { context->Begin(timing.disjoint.Get()); context->End(timing.start.Get()); }
            Parameters parameters {float(width),float(height),iterations,0}; context->UpdateSubresource(constants.Get(),0,nullptr,&parameters,0,0);
            context->Draw(3,0);
            if(query) { context->End(timing.end.Get()); context->End(timing.disjoint.Get()); timing.pending=true; timing.frame=frame; }
            const auto present=qpc(); check(swap->Present(1,0),"Present");
            samples.push_back({frame,begin,present,iterations,0,false}); frame++;
        }
        const double median=calibrated_median();
        const bool valid=!cancelled && !calibration_rejected && median>=target_ms*0.8 && median<=target_ms*1.2;
        std::ostringstream csv;
        csv << "# carga-v1,frequency=" << frequency.QuadPart << ",hz=" << hz << ",width=" << width << ",height=" << height
            << ",calibration_s=10,calibrated_gpu_ms=" << median << ",target_gpu_ms=" << target_ms
            << ",frozen_iterations=" << iterations << ",adaptive=" << !fixed_iterations << ",parent_stopped=" << parent_stopped << "\n";
        csv << "frame,begin_qpc,present_qpc,iterations,gpu_ms,gpu_measured\n";
        for(const auto& sample:samples) csv << sample.frame << ',' << sample.begin_qpc << ',' << sample.present_qpc << ',' << sample.iterations << ',' << sample.gpu_ms << ',' << sample.measured << '\n';
        csv << "# end,rows=" << samples.size() << ",valid=" << valid << "\n";
        const auto text=csv.str(); DWORD written=0;
        if(!WriteFile(file.value,text.data(),DWORD(text.size()),&written,nullptr) || written!=text.size() || !FlushFileBuffers(file.value))
            throw std::runtime_error("No se puede guardar registro completo de carga");
        return valid ? 0 : 3;
    } catch(const std::exception& error) { std::cerr << error.what() << '\n'; return 2; }
}
