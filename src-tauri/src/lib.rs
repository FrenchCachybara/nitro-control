use std::process::Command;

#[tauri::command]
fn set_power_profile(profile: String) -> Result<String, String> {
    let output = Command::new("pkexec")
        .args(["nitro-control", "power", &profile])
        .output()
        .map_err(|e| format!("Erreur : {}", e))?;

    if output.status.success() {
        Ok(format!("Profil {} appliqué !", profile))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
fn set_fans(
    mode: String,
    cpu_custom: bool,
    cpu_speed: u8,
    gpu_custom: bool,
    gpu_speed: u8,
) -> Result<String, String> {
    if mode == "custom" {
        // 1. CPU Fan Override
        let cpu_mode_str = if cpu_custom { "custom" } else { "auto" };
        let mut cpu_args = vec!["nitro-control", "cpu-fan", cpu_mode_str];
        let cpu_spd_str = cpu_speed.to_string();
        if cpu_custom {
            cpu_args.push("--speed");
            cpu_args.push(&cpu_spd_str);
        }
        let _ = Command::new("pkexec").args(&cpu_args).output();

        // 2. GPU Fan Override (Corrigé : "nitro-control" réajouté !)
        let gpu_mode_str = if gpu_custom { "custom" } else { "auto" };
        let mut gpu_args = vec!["nitro-control", "gpu-fan", gpu_mode_str];
        let gpu_spd_str = gpu_speed.to_string();
        if gpu_custom {
            gpu_args.push("--speed");
            gpu_args.push(&gpu_spd_str);
        }
        let _ = Command::new("pkexec").args(&gpu_args).output();

        Ok("Ventilateurs personnalisés mis à jour !".into())
    } else {
        // Mode Auto ou Max
        let output = Command::new("pkexec")
            .args(["nitro-control", "fans", mode.as_str()])
            .output()
            .map_err(|e| format!("Erreur execution: {}", e))?;

        if output.status.success() {
            Ok(format!("Mode fans {} appliqué !", mode))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}

#[tauri::command]
fn get_status() -> Result<(u16, u16, u32, u32), String> {
    let cpu_temp = nitro_control::thermal::ThermalSensor::get_cpu_temp();
    let gpu_temp = nitro_control::thermal::ThermalSensor::get_gpu_temp();

    let mut cpu_rpm: u16 = 0;
    let mut gpu_rpm: u16 = 0;

    if let Ok(output) = Command::new("pkexec").args(["nitro-control", "status"]).output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("CPU") && line.contains("RPM") {
                    let digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
                    cpu_rpm = digits.parse().unwrap_or(0);
                } else if line.contains("GPU") && line.contains("RPM") {
                    let digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
                    gpu_rpm = digits.parse().unwrap_or(0);
                }
            }
        }
    }

    Ok((cpu_rpm, gpu_rpm, cpu_temp, gpu_temp))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            set_power_profile,
            set_fans,
            get_status
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application Tauri");
}