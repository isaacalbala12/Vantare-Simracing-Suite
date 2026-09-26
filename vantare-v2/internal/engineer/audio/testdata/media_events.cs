using System;
using System.Windows.Threading;

// Event source for the Windows PowerShell integration test. The dispatcher
// and script handlers are real; decoding and audio hardware are not exercised.
public class MediaEventsFixture
{
    public static string Scenario;
    public static string ExpectedPath;
    public event EventHandler MediaOpened;
    public event EventHandler MediaEnded;
    public event EventHandler<System.Windows.Media.ExceptionEventArgs> MediaFailed;
    private bool opened;

    public object NaturalDuration
    {
        get { throw new InvalidOperationException("Duration is not a completion signal"); }
    }

    public void Open(Uri source)
    {
        if (source.LocalPath != ExpectedPath)
            throw new InvalidOperationException("The media path changed");
        Console.WriteLine("open");
        if (Scenario == "open-throws")
            throw new InvalidOperationException("Open failed");
        Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Normal, new Action(delegate
        {
            if (Scenario == "failed-before-open")
            {
                Fail();
                return;
            }
            opened = true;
            Console.WriteLine("opened");
            if (MediaOpened != null) MediaOpened(this, EventArgs.Empty);
        }));
    }

    public void Play()
    {
        if (!opened) throw new InvalidOperationException("Play before MediaOpened");
        Console.WriteLine("play");
        if (Scenario == "play-throws")
            throw new InvalidOperationException("Play failed");
        Dispatcher.CurrentDispatcher.BeginInvoke(DispatcherPriority.Normal, new Action(delegate
        {
            if (Scenario == "failed-during-play")
            {
                Fail();
            }
            else if (Scenario == "shutdown-without-end")
            {
                Console.WriteLine("shutdown");
                Dispatcher.CurrentDispatcher.InvokeShutdown();
            }
            else
            {
                Console.WriteLine("ended");
                if (MediaEnded != null) MediaEnded(this, EventArgs.Empty);
            }
        }));
    }

    private void Fail()
    {
        Console.WriteLine("failed");
        // Its WPF argument constructor is internal; the production callback
        // only consumes the failure signal, not its payload.
        if (MediaFailed != null) MediaFailed(this, null);
    }

    public void Close()
    {
        Console.WriteLine("close");
        if (Scenario == "close-throws")
            throw new InvalidOperationException("Close failed");
    }
}
