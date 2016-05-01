#pragma strict

// outlets

var skin        : GUISkin;
var menu_width  = 600;
var menu_height = 400;

// state

private var windowRect : Rect;
private var show_menu  = false;

function OnApplicationPause() {
    Screen.lockCursor = false;
}

function OnApplicationFocus() {
    if (!show_menu) {
        Screen.lockCursor = true;
    }
}

function ShowMenu() {
    show_menu = true;
}

function HideMenu() {
    show_menu = false;
}

function OnGUI () {
    if (!show_menu) {
        return;
    }

    windowRect = GUI.Window(
        0,
        Rect(Screen.width * 0.5 - menu_width * 0.5, Screen.height * 0.5 - menu_height * 0.5, menu_width, menu_height),
        WindowFunction,
        "",
        skin.window);
}

private var draw_cursor      : Vector2;
private var draw_cursor_line : Vector2;
private var line_height      = 24;
private var line_offset      = 24;

function DrawCursor_Init() {
    draw_cursor      = Vector2(25, 25);
    draw_cursor_line = Vector2(0, 0);
}

function DrawCursor_NextLine() {
    draw_cursor_line = Vector2(0, 0);
    draw_cursor.y   += line_offset;
}

function DrawCursor_Offset(val : float) {
    draw_cursor_line.x += val;
}

function DrawCursor_Get() : Vector2 {
    return (draw_cursor + draw_cursor_line);
}

function DrawCursor_RectSpace(width : float) : Rect {
    var rect = Rect(draw_cursor.x + draw_cursor_line.x,
                    draw_cursor.y + draw_cursor_line.y,
                    width,
                    line_height);
    DrawCursor_Offset(width);

    return rect;
}

function DrawLabel(text : String) {
    DrawCursor_Offset(17);
    GUI.Label(DrawCursor_RectSpace(400),
              text,
              skin.label);
}

function DrawCheckbox(val : boolean, text : String) : boolean {
    return GUI.Toggle(DrawCursor_RectSpace(400),
                      val,
                      text,
                      skin.toggle);
}

function DrawSlider(val : float) : float {
    DrawCursor_Offset(18);
    return GUI.HorizontalSlider(DrawCursor_RectSpace(400 - draw_cursor_line.x),
                                val,
                                0.0,
                                1.0);
}

function DrawButton(text : String) : boolean {
    return GUI.Button(DrawCursor_RectSpace(200),
                      text,
                      skin.button);
}

// userprefs

private var master_volume       = 1.0;
private var sound_volume        = 1.0;
private var music_volume        = 1.0;
private var voice_volume        = 1.0;
private var lock_gun_to_center  = false;
private var mouse_invert        = false;
private var mouse_sensitivity   = 0.2;
private var toggle_crouch       = true;
private var gun_distance        = 1.0;

// state

private var show_advanced_sound = false;
private var scroll_view_vector  = Vector2(0,0);
private var vert_scroll         = 0.0;
private var vert_scroll_pixels  = 0.0;


function RestoreDefaults() {
    master_volume      = 1.0;
    sound_volume       = 1.0;
    music_volume       = 1.0;
    voice_volume       = 1.0;
    lock_gun_to_center = false;
    mouse_invert       = false;
    mouse_sensitivity  = 0.2;
    toggle_crouch      = true;
    gun_distance       = 1.0;
}

function Start() {
    Screen.lockCursor = true;
    RestoreDefaults();

    master_volume      = PlayerPrefs.GetFloat("master_volume", master_volume);
    sound_volume       = PlayerPrefs.GetFloat("sound_volume", sound_volume);
    music_volume       = PlayerPrefs.GetFloat("music_volume", music_volume);
    voice_volume       = PlayerPrefs.GetFloat("voice_volume", voice_volume);
    lock_gun_to_center = PlayerPrefs.GetInt("lock_gun_to_center", lock_gun_to_center ? 1 : 0) == 1;
    mouse_invert       = PlayerPrefs.GetInt("mouse_invert", mouse_invert ? 1 : 0) == 1;
    mouse_sensitivity  = PlayerPrefs.GetFloat("mouse_sensitivity", mouse_sensitivity);
    toggle_crouch      = PlayerPrefs.GetInt("toggle_crouch", toggle_crouch? 1 : 0) ==1;
    gun_distance       = PlayerPrefs.GetFloat("gun_distance", 1.0);
}


function SavePrefs() {
    PlayerPrefs.SetFloat("master_volume", master_volume);
    PlayerPrefs.SetFloat("sound_volume", sound_volume);
    PlayerPrefs.SetFloat("music_volume", music_volume);
    PlayerPrefs.SetFloat("voice_volume", voice_volume);
    PlayerPrefs.SetFloat("mouse_sensitivity", mouse_sensitivity);
    PlayerPrefs.SetInt("lock_gun_to_center", lock_gun_to_center ? 1 : 0);
    PlayerPrefs.SetInt("mouse_invert", mouse_invert ? 1 : 0);
    PlayerPrefs.SetInt("toggle_crouch", toggle_crouch ? 1 : 0);
    PlayerPrefs.SetFloat("gun_distance", gun_distance);
}

function IsMenuShown() : boolean {
    return show_menu;
}

function Update() {
    // TOOD: does all this need to happen every frame?
    if (vert_scroll != -1.0) {
        vert_scroll += Input.GetAxis("Mouse ScrollWheel");
    }
    if (Input.GetKeyDown ("escape") && !show_menu) {
        Screen.lockCursor = false;
        ShowMenu();
    } else if (Input.GetKeyDown ("escape") && show_menu) {
        Screen.lockCursor = true;
        HideMenu();
    }
    if (Input.GetMouseButtonDown(0) && !show_menu) {
        Screen.lockCursor = true;
    }
    if (show_menu) {
        Time.timeScale = 0.0;
    } else if (Time.timeScale == 0.0) {
        var mod_controller = GameObject.Find("gui_skin_holder").GetComponent(GUISkinHolder).mod_controller;
        Time.timeScale     = mod_controller.HasPerk(Perk.SLOW_DAY) ? mod_controller.GetSlowDayTimescale() : 1.0;
    }
}

function WindowFunction(windowID : int) {
    scroll_view_vector = GUI.BeginScrollView(Rect(0, 0, windowRect.width, windowRect.height),
                                             scroll_view_vector,
                                             Rect(0, vert_scroll_pixels, windowRect.width, windowRect.height));

    DrawCursor_Init();
    mouse_invert = DrawCheckbox(mouse_invert, "Invert mouse");
    DrawCursor_NextLine();
    DrawLabel("Mouse sensitivity:");
    DrawCursor_NextLine();
    mouse_sensitivity = DrawSlider(mouse_sensitivity);
    DrawCursor_NextLine();
    DrawLabel("Distance from eye to gun:");
    DrawCursor_NextLine();
    gun_distance = DrawSlider(gun_distance);
    DrawCursor_NextLine();
    toggle_crouch = DrawCheckbox(toggle_crouch, "Toggle crouch");
    DrawCursor_NextLine();
    lock_gun_to_center = DrawCheckbox(lock_gun_to_center, "Lock gun to screen center");
    DrawCursor_NextLine();
    DrawLabel("Master volume:");
    DrawCursor_NextLine();
    master_volume = DrawSlider(master_volume);
    DrawCursor_NextLine();
    show_advanced_sound = DrawCheckbox(show_advanced_sound, "Advanced sound options");
    DrawCursor_NextLine();
    if (show_advanced_sound) {
        var indent = 44;
        DrawLabel("....Sounds:");
        DrawCursor_NextLine();
        DrawCursor_Offset(indent);
        sound_volume = DrawSlider(sound_volume);
        DrawCursor_NextLine();
        DrawLabel("....Voice:");
        DrawCursor_NextLine();
        DrawCursor_Offset(indent);
        voice_volume = DrawSlider(voice_volume);
        DrawCursor_NextLine();
        DrawLabel("....Music:");
        DrawCursor_NextLine();
        DrawCursor_Offset(indent);
        music_volume = DrawSlider(music_volume);
        DrawCursor_NextLine();
    }
    if (DrawButton("Resume")) {
        Screen.lockCursor = true;
        show_menu         = false;
    }
    draw_cursor.y += line_offset * 0.3;
    DrawCursor_NextLine();
    if (DrawButton("Restore defaults")) {
        RestoreDefaults();
    }
    DrawCursor_NextLine();
    draw_cursor.y += line_offset * 0.3;
    if (DrawButton("Exit game")) {
        Application.Quit();
    }

    var content_height = draw_cursor.y;

    GUI.EndScrollView();

    if (content_height > windowRect.height) {
        var leeway = (content_height / windowRect.height - windowRect.height / content_height);
        if (vert_scroll == -1.0) {
            vert_scroll = leeway;
        }
        vert_scroll = GUI.VerticalScrollbar(Rect(menu_width - 20, 20, menu_width, menu_height - 25),
                                                 vert_scroll,
                                                 windowRect.height / content_height,
                                                 content_height / windowRect.height,
                                                 0.0);
        vert_scroll_pixels = windowRect.height * (leeway - vert_scroll);
    } else {
        vert_scroll        = -1.0;
        vert_scroll_pixels = 0.0;
    }
    // TODO: maybe only call this when we exit the menu
    SavePrefs();
}
